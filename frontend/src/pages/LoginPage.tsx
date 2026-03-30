import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/shared";
import { useAuth } from "@/providers/AuthProvider";
import { BrandMark } from "@/components/brand";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const targetPath = (location.state as LocationState | null)?.from?.pathname ?? "/";

  if (isAuthenticated) {
    return <Navigate to={targetPath} replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await login(username, password);
      navigate(targetPath, { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(119,94,255,0.22),transparent_32%),linear-gradient(180deg,rgba(9,13,26,1)_0%,rgba(7,10,20,1)_100%)] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <BrandMark className="h-11 w-11" iconClassName="h-5 w-5" />
          <div>
            <p className="text-base font-semibold text-foreground">RestToMCP Studio</p>
            <p className="text-xs text-muted-foreground">Control Plane</p>
          </div>
        </div>

        <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(16,21,40,0.96)_0%,rgba(11,15,29,0.98)_100%)] shadow-[0_30px_80px_-42px_rgba(80,69,210,0.8)]">
          <CardHeader>
            <CardTitle className="text-2xl text-white">Sign in</CardTitle>
            <CardDescription>Authenticate to manage RestToMCP Studio and publish runtime snapshots.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <FieldLabel htmlFor="username" required>Username</FieldLabel>
                <div className="relative">
                  <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    className="pl-9"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="password" required>Password</FieldLabel>
                <div className="relative">
                  <LockKeyhole className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="pl-9"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <Button className="w-full" type="submit" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
