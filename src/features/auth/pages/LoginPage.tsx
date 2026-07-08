import { useState } from "react";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthMutations } from "../hooks/useAuthStatus";

interface LoginPageProps {
    setupComplete: boolean;
}

export function LoginPage({ setupComplete }: LoginPageProps) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const { register, login } = useAuthMutations();
    const isPending = register.isPending || login.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!setupComplete && password !== confirmPassword) {
            setError("Passwords don't match.");
            return;
        }

        try {
            if (setupComplete) await login.mutateAsync({ username, password });
            else await register.mutateAsync({ username, password });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        {setupComplete ? (
                            <KeyRound className="h-5 w-5 text-primary" />
                        ) : (
                            <UserPlus className="h-5 w-5 text-primary" />
                        )}
                    </div>
                    <CardTitle>{setupComplete ? "Log In" : "Create Your Account"}</CardTitle>
                    <CardDescription>
                        {setupComplete
                            ? "Story Nexus is password-protected."
                            : "This is a one-time setup — the first account created is the only account."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                autoFocus
                                autoComplete="username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete={setupComplete ? "current-password" : "new-password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {!setupComplete && (
                            <div className="space-y-1.5">
                                <Label htmlFor="confirm-password">Confirm Password</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                        )}
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button type="submit" className="w-full" disabled={isPending}>
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {setupComplete ? "Log In" : "Create Account"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
