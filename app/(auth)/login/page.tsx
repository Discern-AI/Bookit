"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { giftReturnPath } from "@/lib/auth-return";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [next, setNext] = useState("/chat");
  useEffect(() => setNext(giftReturnPath(window.location.search)), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      setLoading(false);
      if (result?.error) {
        setError("That didn't work. Check your email and password.");
        return;
      }
      router.push(giftReturnPath(window.location.search));
      router.refresh();
    } catch {
      setError("The connection was interrupted. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm text-ink-800">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm text-ink-800">
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
        Log in
      </Button>
      <Link href="/forgot-password" className="text-shelf-700 underline">
        Forgot your password?
      </Link>
      <p className="text-sm text-ink-500 text-center mt-2">
        New here?{" "}
        <Link
          href={
            next === "/chat"
              ? "/signup"
              : `/signup?next=${encodeURIComponent(next)}`
          }
          className="text-shelf-700 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
