"use client";

import { useState, useEffect, useRef } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const ACCESS_CODE = "2008008";
const STORAGE_KEY = "washout.access";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "granted") {
      setHasAccess(true);
    }
  }, []);

  const handleSubmit = () => {
    if (code === ACCESS_CODE) {
      localStorage.setItem(STORAGE_KEY, "granted");
      setHasAccess(true);
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setCode(""), 300);
    }
  };

  useEffect(() => {
    if (code.length === 7) {
      handleSubmit();
    }
  }, [code]);

  if (!mounted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />
      
      {/* Glow effect */}
      <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      
      <div className="relative z-10 mx-4 w-full max-w-md">
        <div className="text-center">
          {/* Logo */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          
          {/* Title */}
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">
            Washout
          </h1>
          <p className="mb-10 text-muted-foreground">
            Enter your access code to continue
          </p>

          {/* OTP Input */}
          <div 
            className={`mb-6 flex justify-center transition-transform ${shake ? 'animate-shake' : ''}`}
            style={{
              animation: shake ? 'shake 0.5s ease-in-out' : 'none'
            }}
          >
            <InputOTP
              maxLength={7}
              value={code}
              onChange={(value) => {
                setCode(value);
                setError(false);
              }}
              className="gap-2"
            >
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className={`h-14 w-11 rounded-lg border-2 bg-card/50 text-xl font-semibold backdrop-blur-sm transition-all ${
                      error 
                        ? 'border-destructive text-destructive' 
                        : 'border-border hover:border-primary/50 focus:border-primary'
                    }`}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Error message */}
          {error && (
            <p className="mb-6 text-sm text-destructive">
              Invalid access code. Please try again.
            </p>
          )}

          {/* Submit button */}
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={code.length !== 7}
            className="h-12 w-full max-w-xs bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <ShieldCheck className="mr-2 h-5 w-5" />
            Verify Access
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {/* Footer */}
          <p className="mt-10 text-xs text-muted-foreground/60">
            This platform is for authorized users only.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
