import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AccessGate } from "@/components/AccessGate";

const Dashboard = lazy(() => import("@/components/Dashboard"));

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <AccessGate>
      <Suspense
        fallback={
          <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Loading platform...</span>
            </div>
          </div>
        }
      >
        <Dashboard />
      </Suspense>
      <Toaster theme="dark" position="bottom-right" richColors />
    </AccessGate>
  );
}
