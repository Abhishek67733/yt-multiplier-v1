"use client";
import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

interface ToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

const ToastCtx = createContext<ToastContextValue>({ success: () => {}, error: () => {} });

export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const add = useCallback((type: "success" | "error", message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ success: (m) => add("success", m), error: (m) => add("error", m) }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium pointer-events-auto transition-all
              ${t.type === "success"
                ? "bg-green-950 border-green-800 text-green-300"
                : "bg-red-950 border-red-800 text-red-300"
              }`}
          >
            {t.type === "success"
              ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
              : <XCircle className="w-4 h-4 flex-shrink-0" />
            }
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
