"use client";

import { useCallback, useEffect, useState } from "react";

// The browser always calls /api/... on the Next.js server.
// app/api/[...path]/route.js forwards it to the FastAPI backend.
const API = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export default function Home() {
  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadTodos = useCallback(async () => {
    try {
      setTodos(await request("/todos"));
      setError("");
    } catch (err) {
      setError(`Could not load todos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  async function addTodo(e) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setSaving(true);
    try {
      await request("/todos", {
        method: "POST",
        body: JSON.stringify({ title: value }),
      });
      setTitle("");
      await loadTodos();
    } catch (err) {
      setError(`Could not add todo: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleTodo(todo) {
    try {
      await request(`/todos/${todo.id}`, {
        method: "PUT",
        body: JSON.stringify({ completed: !todo.completed }),
      });
      await loadTodos();
    } catch (err) {
      setError(`Could not update todo: ${err.message}`);
    }
  }

  async function deleteTodo(id) {
    try {
      await request(`/todos/${id}`, { method: "DELETE" });
      await loadTodos();
    } catch (err) {
      setError(`Could not delete todo: ${err.message}`);
    }
  }

  const doneCount = todos.filter((t) => t.completed).length;

  return (
    <main className="container">
      <h1>Todo App</h1>
      <p className="subtitle">Next.js + FastAPI + MySQL</p>

      <div className="card">
        {error && <div className="error">{error}</div>}

        <form className="add-form" onSubmit={addTodo}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            maxLength={255}
          />
          <button className="btn-primary" type="submit" disabled={saving || !title.trim()}>
            Add
          </button>
        </form>

        {loading ? (
          <div className="empty">Loading...</div>
        ) : todos.length === 0 ? (
          <div className="empty">No todos yet. Add your first one!</div>
        ) : (
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id} className="todo-item">
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo)}
                />
                <span className={`todo-title ${todo.completed ? "done" : ""}`}>
                  {todo.title}
                </span>
                <button className="btn-danger" onClick={() => deleteTodo(todo.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        {todos.length > 0 && (
          <div className="status">
            {doneCount} of {todos.length} completed
          </div>
        )}
      </div>
    </main>
  );
}
