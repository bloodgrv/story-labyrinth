import { KeyRound, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InstanceLabelCard, RevokeAllSessionsCard } from "@/features/auth/components/RemoteAccessSettingsCards";
import {
    useCreateUserMutation,
    useResetPasswordMutation,
    useSetUserActiveMutation,
    useUpdateUserRoleMutation,
    useUsersQuery
} from "@/features/auth/hooks/useUsersQuery";
import type { AuthUser, UserRole } from "@/types/auth";

const ROLES: UserRole[] = ["owner", "editor", "viewer"];

function NewUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<UserRole>("editor");
    const createMutation = useCreateUserMutation();

    const handleCreate = () => {
        createMutation.mutate(
            { username, password, role },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setUsername("");
                    setPassword("");
                    setRole("editor");
                }
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="new-user-username">Username</Label>
                        <Input id="new-user-username" value={username} onChange={e => setUsername(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="new-user-password">Password</Label>
                        <Input
                            id="new-user-password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Role</Label>
                        <Select value={role} onValueChange={value => setRole(value as UserRole)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ROLES.map(r => (
                                    <SelectItem key={r} value={r}>
                                        {r}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!username.trim() || password.length < 8 || createMutation.isPending}
                    >
                        {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ResetPasswordDialog({ user, onOpenChange }: { user: AuthUser | null; onOpenChange: (open: boolean) => void }) {
    const [newPassword, setNewPassword] = useState("");
    const resetMutation = useResetPasswordMutation();

    const handleReset = () => {
        if (!user) return;
        resetMutation.mutate(
            { id: user.id, newPassword },
            { onSuccess: () => { onOpenChange(false); setNewPassword(""); } }
        );
    };

    return (
        <Dialog open={!!user} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reset password for {user?.username}</DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-1.5">
                    <Label htmlFor="reset-password">New password</Label>
                    <Input
                        id="reset-password"
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleReset} disabled={newPassword.length < 8 || resetMutation.isPending}>
                        {resetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Reset
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function UsersTool() {
    const { data: users = [], isLoading } = useUsersQuery();
    const updateRoleMutation = useUpdateUserRoleMutation();
    const setActiveMutation = useSetUserActiveMutation();
    const [newUserOpen, setNewUserOpen] = useState(false);
    const [resettingUser, setResettingUser] = useState<AuthUser | null>(null);

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Users</h1>
                <Button onClick={() => setNewUserOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    New User
                </Button>
            </div>

            <InstanceLabelCard />
            <RevokeAllSessionsCard />

            {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
                <div className="border rounded-md divide-y">
                    {users.map(user => (
                        <div key={user.id} className="flex items-center gap-4 p-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user.username}</p>
                                {!user.isActive && (
                                    <Badge variant="outline" className="mt-1">
                                        Deactivated
                                    </Badge>
                                )}
                            </div>
                            <Select
                                value={user.role}
                                onValueChange={value => updateRoleMutation.mutate({ id: user.id, role: value as UserRole })}
                            >
                                <SelectTrigger className="w-28">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLES.map(r => (
                                        <SelectItem key={r} value={r}>
                                            {r}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`active-${user.id}`} className="text-xs text-muted-foreground">
                                    Active
                                </Label>
                                <Switch
                                    id={`active-${user.id}`}
                                    checked={user.isActive}
                                    onCheckedChange={isActive => setActiveMutation.mutate({ id: user.id, isActive })}
                                />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setResettingUser(user)}>
                                <KeyRound className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <NewUserDialog open={newUserOpen} onOpenChange={setNewUserOpen} />
            <ResetPasswordDialog user={resettingUser} onOpenChange={open => !open && setResettingUser(null)} />
        </div>
    );
}
