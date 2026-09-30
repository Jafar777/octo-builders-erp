import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";

export const metadata = {
  title: "Sign In — Octo Builders",
};

export default function AuthPage() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-32">
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    </div>
  );
}
