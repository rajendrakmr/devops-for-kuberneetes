import "./globals.css";

export const metadata = {
  title: "Todo App",
  description: "FastAPI + Next.js + MySQL practice project",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
