# Kubernetes + Envoy Gateway Cheat Sheet

Nov 8, 2026 · @cloud

## 1. Namespace set karna

Current context ka default namespace badalne ke liye ek command kaafi hai, aur ye `~/.kube/config` mein save rehta hai.

```bash
kubectl config set-context --current --namespace=production
kubectl config view --minify | grep namespace:   # verify
kubectl get namespaces                           # list
kubectl get pods -n production                   # sirf ek command ke liye override
```

- `kubens production` (kubectx tool): aasan switching, `kubens -` se pichle namespace par wapas.
- Alias: `alias kns='kubectl config set-context --current --namespace'`, phir `kns production`.

## 2. HPA behavior (scale up / scale down)

Ye block `HorizontalPodAutoscaler` (`autoscaling/v2`) ke `spec:` ke andar jaata hai. Policy type `Pods` ya `Percent` hota hai, `Pod` galat hai.

```yaml
behavior:
  scaleUp:
    stabilizationWindowSeconds: 0
    selectPolicy: Max
    policies:
      - type: Pods
        value: 1
        periodSeconds: 15
  scaleDown:
    stabilizationWindowSeconds: 300
    selectPolicy: Min
    policies:
      - type: Pods
        value: 1
        periodSeconds: 15
```

| Field | Matlab |
| --- | --- |
| `scaleUp.stabilizationWindowSeconds: 0` | Load badhte hi turant scale up, koi wait nahi |
| `scaleUp` policy | Har 15 second mein maximum 1 pod add |
| `scaleDown.stabilizationWindowSeconds: 300` | Pichle 5 minute ka sabse bada recommended count dekhta hai, flapping rokta hai |
| `scaleDown` policy | Har 15 second mein maximum 1 pod remove |
| `selectPolicy` | Max = sabse bada change allow, Min = sabse chhota. Ek hi policy ho to farq nahi padta |

Net effect: scale up tez par dheere (1 pod / 15s), scale down 5 minute wait ke baad aur dheere. Tez scale up chahiye to ek aur policy `type: Percent, value: 100, periodSeconds: 15` jodo aur `selectPolicy: Max` rakho.

## 3. EnvoyProxy (Envoy ko kaise deploy karna hai)

`EnvoyProxy` Envoy Gateway ka custom resource hai. Isse Envoy ke Deployment aur Service ki settings tay hoti hain. Default Service type `LoadBalancer` hota hai.

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: kind-envoy-config
  namespace: demo-ns
spec:
  provider:
    type: Kubernetes
    kubernetes:
      envoyService:
        type: NodePort        # cloud mein LoadBalancer
```

| Type | Kab use karein |
| --- | --- |
| `NodePort` | Kind / local cluster. Port range 30000-32767, `localhost:<nodeport>` se access (kind `extraPortMappings` ke saath) |
| `LoadBalancer` | EKS, GKE, AKS. Cloud khud external IP deta hai. Kind mein `<pending>` rahega jab tak MetalLB ya `cloud-provider-kind` na ho |

LoadBalancer ke saath useful options: `annotations` (jaise AWS NLB ke liye `service.beta.kubernetes.io/aws-load-balancer-type: nlb`) aur `externalTrafficPolicy: Local` (client ka real source IP bachane ke liye).

## 4. GatewayClass (kaun controller manage karega)

`GatewayClass` StorageClass ya IngressClass jaisa hai. Ye batata hai ki Gateways ko kaun sa controller (Envoy, Istio, NGINX...) aur kis config ke saath manage karega. Ye cluster-scoped hai, isliye `metadata.namespace` mat likho.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: envoy-gateway
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
  parametersRef:
    group: gateway.envoyproxy.io
    kind: EnvoyProxy
    name: kind-envoy-config
    namespace: demo-ns     # EnvoyProxy namespaced hai, ye zaroori hai
```

- `controllerName`: fixed value, Envoy Gateway controller ko point karti hai.
- `parametersRef`: pichle section wale EnvoyProxy ko attach karta hai, tabhi NodePort wali settings lagti hain.
- Check: `kubectl get gatewayclass`, `ACCEPTED` column `True` hona chahiye. Warna `kubectl describe gatewayclass envoy-gateway`.

## 5. Gateway aur listeners

`Gateway` cluster ka entry point hai: kaun se port aur protocol par traffic aayega. `gatewayClassName` se GatewayClass ko choose karta hai, aur Envoy Gateway uske liye Envoy proxy (Deployment + Service) banata hai.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: demo-gateway
  namespace: demo-ns
spec:
  gatewayClassName: envoy-gateway
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: Same
```

`from: Same` ka matlab HTTPRoute bhi Gateway wale namespace mein honi chahiye, warna attach nahi hogi.

### Listener ke fields

| Field | Kaam |
| --- | --- |
| `name` | Unique naam, HTTPRoute ke `sectionName` mein use hota hai |
| `port` | Kis port par sunna hai |
| `protocol` | `HTTP`, `HTTPS`, `TLS`, `TCP`, `UDP` |
| `hostname` | Sirf is host ke requests match (wildcard `*.example.com` bhi). Nahi diya to sab hosts |
| `tls` | `mode: Terminate` (Gateway par decrypt) ya `Passthrough` (backend tak encrypted), plus `certificateRefs` aur `options` |
| `allowedRoutes.namespaces.from` | `Same`, `All`, ya `Selector` (label match) |
| `allowedRoutes.kinds` | Kaun se route types allow: HTTPRoute, GRPCRoute, TCPRoute, TLSRoute, UDPRoute |

Protocol ke hisaab se route: HTTP/HTTPS ke liye `HTTPRoute` ya `GRPCRoute`, TLS ke liye `TLSRoute`, TCP ke liye `TCPRoute`, UDP ke liye `UDPRoute`. TCP/UDP/TLSRoute experimental channel mein hain, CRDs alag install karne pad sakte hain.

### HTTPS listener ka example

```yaml
listeners:
  - name: https
    protocol: HTTPS
    port: 443
    hostname: app.example.com
    tls:
      mode: Terminate
      certificateRefs:
        - kind: Secret
          name: my-tls-secret
    allowedRoutes:
      namespaces:
        from: All
```

```bash
kubectl create secret tls my-tls-secret --cert=tls.crt --key=tls.key -n demo-ns
```

Secret dusre namespace mein ho to `ReferenceGrant` banana padta hai. Kisi route ko ek hi listener se jodna ho to `parentRefs` mein `sectionName: https` do.

### Gateway spec ke extra fields

- `addresses`: specific IP maangne ke liye (controller support kare tab).
- `infrastructure.labels` / `annotations`: Gateway se bani Service aur Pods par labels, annotations (cloud LB annotations yahin dete hain).
- `infrastructure.parametersRef`: sirf ek Gateway ke liye EnvoyProxy config attach karna (newer versions).
- Status (controller bharta hai): `addresses`, `conditions` (`Accepted`, `Programmed`), `listeners[].attachedRoutes`.

Check: `kubectl get gateway -n demo-ns`, `PROGRAMMED` `True` aur `ADDRESS` dikhna chahiye.

## 6. Envoy Gateway policies (kab aur kyu)

Pehle jo problem hai wo dekho: slow client, backend ki reliability, ya authentication. Policy `targetRefs` se Gateway ya HTTPRoute par lagti hai. Route par lagi policy Gateway wali ko override karti hai.

| Problem | Policy |
| --- | --- |
| Slow clients, real client IP, keepalive, HTTP/2, proxy protocol | `ClientTrafficPolicy` |
| Retries, timeouts, rate limit, circuit breaker, LB algorithm | `BackendTrafficPolicy` |
| JWT, CORS, basic auth, OIDC, IP allow/deny | `SecurityPolicy` |
| Koi aur raasta nahi bacha | `EnvoyPatchPolicy` |

### ClientTrafficPolicy (client aur Gateway ke beech)

Kab: client se aane wale connection ko control karna ho. Kyu: slow ya malicious client connections hold karke resources khatam na kar de (Slowloris), aur backend ko real client IP mile.

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: ClientTrafficPolicy
metadata:
  name: client-policy
  namespace: demo-ns
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: demo-gateway
  timeout:
    http:
      requestReceivedTimeout: 10s
      idleTimeout: 60s
  clientIPDetection:
    xForwardedFor:
      numTrustedHops: 1      # LB ke peeche real client IP
  http2:
    maxConcurrentStreams: 100
```

### BackendTrafficPolicy (Gateway aur backend ke beech)

Kab: backend services ke saath behavior control karna ho. Kyu: backend overload na ho, temporary failure par auto retry ho, traffic barabar bante.

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  name: backend-policy
  namespace: demo-ns
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: my-route
  loadBalancer:
    type: LeastRequest       # RoundRobin | Random | LeastRequest | ConsistentHash
  retry:
    numRetries: 3
    retryOn:
      triggers: ["connect-failure", "5xx"]
  timeout:
    http:
      requestTimeout: 15s
  circuitBreaker:
    maxConnections: 100
    maxPendingRequests: 50
  rateLimit:
    type: Local
    local:
      rules:
        - limit:
            requests: 100
            unit: Minute
```

Examples: pod kabhi kabhi 503 deta hai to `retry`, buggy service poore system ko na girae to `circuitBreaker`, public API par abuse rokna ho to `rateLimit`, sticky sessions chahiye to `ConsistentHash`.

### SecurityPolicy (kaun access kar sakta hai)

Kab: ye control karna ho ki kaun API ya app use kar sakta hai. Kyu: har microservice mein auth code likhne ki jagah Gateway par ek jagah enforce hota hai.

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: security-policy
  namespace: demo-ns
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: my-route
  cors:
    allowOrigins:
      - "https://myapp.com"
    allowMethods: ["GET", "POST"]
    allowHeaders: ["Authorization", "Content-Type"]
  jwt:
    providers:
      - name: auth0
        issuer: https://my-tenant.auth0.com/
        remoteJWKS:
          uri: https://my-tenant.auth0.com/.well-known/jwks.json
```

Examples: browser frontend alag domain se API call kare to `cors`, sirf valid token walon ke liye `jwt`, internal tool par simple password ke liye `basicAuth`, OAuth2 / OIDC login ke liye `oidc`, aur external auth service ke liye `extAuth`.

### EnvoyPatchPolicy (advanced, last resort)

Kab: jab koi feature Envoy Gateway API mein exposed nahi hai par raw Envoy mein possible hai. Ye generated xDS config par seedha JSON Patch lagata hai. Risk: Envoy upgrade par toot sakta hai, galat patch poora Gateway kharab kar sakta hai, aur ye default mein disabled hota hai (EnvoyGateway config mein enable karna padta hai). Pehle upar ki teen policies try karo.

Field names Envoy Gateway version ke hisaab se badal sakte hain, exact fields ke liye `kubectl explain backendtrafficpolicy.spec` chalao.

## 7. Poora flow aur debug commands

&#91;embedded content: config chain + traffic path · 4 + 5 boxes\]

Upar wali lane batati hai ki kaun kisko refer karta hai, neeche wali lane request ka raasta. Policies raaste ke hisson par `targetRefs` se lagti hain.

```bash
kubectl get gatewayclass
kubectl get gateway -n demo-ns
kubectl get httproute -n demo-ns
kubectl describe gateway demo-gateway -n demo-ns
kubectl get svc -n envoy-gateway-system
```

| Dikkat | Pehle ye check karo |
| --- | --- |
| GatewayClass `ACCEPTED` False | `parametersRef` ka naam aur namespace, aur EnvoyProxy pehle apply hua ho |
| Gateway `ADDRESS` pending | Kind mein LB provider nahi hota: `NodePort` rakho ya `cloud-provider-kind` / MetalLB chalao |
| HTTPRoute attach nahi ho raha | Route aur Gateway ka namespace (`from: Same`), `parentRefs` ka naam, `sectionName` |
