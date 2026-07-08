import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import "./index.css";
import ApplicationDetail from "./pages/ApplicationDetail";
import Applications from "./pages/Applications";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import NewApplication from "./pages/NewApplication";
import Resumes from "./pages/Resumes";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/applications", element: <Applications /> },
      { path: "/applications/new", element: <NewApplication /> },
      { path: "/applications/:id", element: <ApplicationDetail /> },
      { path: "/resumes", element: <Resumes /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
