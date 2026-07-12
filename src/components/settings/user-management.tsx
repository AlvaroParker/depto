"use client";

import {
	LockKeyhole,
	Landmark,
	Mail,
	Pencil,
	Save,
	ShieldCheck,
	Trash2,
	UserPlus,
	UserRound,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectField } from "@/components/ui/field";
import { ParticipantBankAccountDialog } from "@/components/settings/participant-bank-account-dialog";
import { createUser, deleteUser, updateUser } from "@/lib/api/users";
import { ROLE_LABELS } from "@/lib/const/roles";
import type { ManagedUser } from "@/lib/types/user";
import type { ParticipantBankAccount } from "@/lib/types/bank-account";

interface UserManagementProps {
	currentUserId: string;
	initialUsers: ManagedUser[];
}

const roleOrder = { admin: 1, root: 0, user: 2 } as const;

function sortUsers(users: ManagedUser[]): ManagedUser[] {
	return [...users].sort(
		(first, second) =>
			roleOrder[first.role] - roleOrder[second.role] ||
			first.displayName.localeCompare(second.displayName, "es-CL"),
	);
}

export function UserManagement({ currentUserId, initialUsers }: UserManagementProps) {
	const [users, setUsers] = useState(initialUsers);
	const [createRole, setCreateRole] = useState<"admin" | "user">("user");
	const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
	const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
	const [bankUser, setBankUser] = useState<ManagedUser | null>(null);
	const [formError, setFormError] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
	const [editError, setEditError] = useState("");
	const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string[] | undefined>>({});
	const [notice, setNotice] = useState("");
	const [pending, startTransition] = useTransition();
	const counts = useMemo(
		() => ({
			admins: users.filter((user) => user.role === "admin" || user.role === "root").length,
			users: users.filter((user) => user.role === "user").length,
		}),
		[users],
	);

	function submit(formData: FormData) {
		setFormError("");
		setFieldErrors({});
		setNotice("");
		startTransition(async () => {
			const common = {
				displayName: String(formData.get("displayName") ?? ""),
				password: String(formData.get("password") ?? ""),
				username: String(formData.get("username") ?? ""),
			};
			const result = await createUser(
				createRole === "user"
					? { ...common, email: String(formData.get("email") ?? ""), role: "user" }
					: { ...common, role: "admin" },
			);
			if (result.err) {
				setFormError(result.val.message);
				setFieldErrors(result.val.errors ?? {});
				return;
			}
			setUsers((current) => sortUsers([...current, result.val.user]));
			setNotice(`Acceso creado para ${result.val.user.displayName}.`);
			const form = document.getElementById("create-user-form");
			if (form instanceof HTMLFormElement) form.reset();
			setCreateRole("user");
		});
	}

	function submitCreateForm(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		submit(new FormData(event.currentTarget));
	}

	function confirmDelete() {
		if (!deletingUser) return;
		setFormError("");
		setNotice("");
		startTransition(async () => {
			const result = await deleteUser(deletingUser.id);
			if (result.err) {
				setFormError(result.val.message);
				setDeletingUser(null);
				return;
			}
			setUsers((current) => current.filter((user) => user.id !== deletingUser.id));
			setNotice(`El acceso de ${deletingUser.displayName} fue eliminado.`);
			setDeletingUser(null);
		});
	}

	function openEditor(user: ManagedUser) {
		setEditError("");
		setEditFieldErrors({});
		setNotice("");
		setEditingUser(user);
	}

	function closeEditor() {
		setEditingUser(null);
		setEditError("");
		setEditFieldErrors({});
	}

	function submitEdit(formData: FormData) {
		if (!editingUser) return;
		setEditError("");
		setEditFieldErrors({});
		setNotice("");
		const password = String(formData.get("password") ?? "");
		startTransition(async () => {
			const result = await updateUser(editingUser.id, {
				displayName: String(formData.get("displayName") ?? ""),
				email: String(formData.get("email") ?? ""),
				...(password ? { password } : {}),
				username: String(formData.get("username") ?? ""),
			});
			if (result.err) {
				setEditError(result.val.message);
				setEditFieldErrors(result.val.errors ?? {});
				return;
			}
			setUsers((current) =>
				sortUsers(current.map((user) => (user.id === result.val.user.id ? result.val.user : user))),
			);
			setNotice(`El acceso de ${result.val.user.displayName} fue actualizado.`);
			closeEditor();
		});
	}

	function saveBankAccount(bankAccount: ParticipantBankAccount) {
		if (!bankUser) return;
		setUsers((current) =>
			current.map((user) => (user.id === bankUser.id ? { ...user, bankAccount } : user)),
		);
		setNotice(`Datos bancarios de ${bankUser.displayName} actualizados.`);
		setBankUser(null);
	}

	function removeBankAccount() {
		if (!bankUser) return;
		setUsers((current) =>
			current.map((user) => (user.id === bankUser.id ? { ...user, bankAccount: null } : user)),
		);
		setNotice(`Datos bancarios de ${bankUser.displayName} eliminados.`);
		setBankUser(null);
	}

	return (
		<div className="mt-8 grid gap-6 xl:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
			<section className="border-line bg-paper/85 rounded-3xl border p-6 shadow-[0_22px_60px_-48px_rgba(40,40,34,0.75)] sm:p-7">
				<div className="flex items-start gap-4">
					<span className="bg-accent/10 text-accent grid size-11 shrink-0 place-items-center rounded-2xl">
						<UserPlus aria-hidden size={21} />
					</span>
					<div>
						<h2 className="font-display text-2xl font-semibold">Nuevo acceso</h2>
						<p className="text-ink-muted mt-1 text-sm leading-6">
							Los administradores crean accesos y mantienen al día las cuentas de usuario.
						</p>
					</div>
				</div>
				<form className="mt-7 grid gap-5" id="create-user-form" onSubmit={submitCreateForm}>
					<Field
						error={fieldErrors.displayName?.[0]}
						id="displayName"
						label="Nombre"
						name="displayName"
						required
					/>
					<Field
						autoCapitalize="none"
						autoComplete="off"
						error={fieldErrors.username?.[0]}
						id="username"
						label="Usuario"
						name="username"
						required
					/>
					<SelectField
						error={fieldErrors.role?.[0]}
						id="role"
						label="Rol"
						name="role"
						onChange={(event) => setCreateRole(event.target.value === "admin" ? "admin" : "user")}
						required
						value={createRole}
					>
						<option value="user">Usuario</option>
						<option value="admin">Administrador</option>
					</SelectField>
					{createRole === "user" ? (
						<Field
							autoCapitalize="none"
							autoComplete="email"
							error={fieldErrors.email?.[0]}
							id="email"
							label="Correo"
							name="email"
							required
							type="email"
						/>
					) : null}
					<Field
						autoComplete="new-password"
						error={fieldErrors.password?.[0]}
						hint="Mínimo 12 caracteres."
						id="password"
						label="Contraseña inicial"
						minLength={12}
						name="password"
						required
						type="password"
					/>
					<Button className="w-full" disabled={pending} type="submit">
						<UserPlus aria-hidden size={18} /> {pending ? "Guardando…" : "Crear acceso"}
					</Button>
				</form>
			</section>

			<section>
				<div className="border-line bg-paper-strong/55 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4">
					<div>
						<p className="font-display text-xl font-semibold">Accesos activos</p>
						<p className="text-ink-muted mt-0.5 text-xs">
							{counts.admins} con administración · {counts.users} usuarios
						</p>
					</div>
					<Badge>{users.length} en total</Badge>
				</div>
				{formError ? (
					<p
						className="border-danger/20 bg-danger/8 text-danger mb-4 rounded-xl border px-4 py-3 text-sm"
						role="alert"
					>
						{formError}
					</p>
				) : null}
				{notice ? (
					<p
						className="border-positive/20 bg-positive/8 text-positive-strong mb-4 rounded-xl border px-4 py-3 text-sm"
						role="status"
					>
						{notice}
					</p>
				) : null}
				<div className="grid min-w-0 gap-3">
					{users.map((user) => {
						const isCurrent = user.id === currentUserId;
						const isRoot = user.role === "root";
						return (
							<article
								className="border-line bg-paper/90 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:flex sm:gap-4 sm:p-5"
								key={user.id}
							>
								<span
									className={
										user.role === "root"
											? "bg-accent/12 text-accent grid size-11 shrink-0 place-items-center rounded-full"
											: user.role === "admin"
												? "bg-positive/12 text-positive-strong grid size-11 shrink-0 place-items-center rounded-full"
												: "bg-ink/7 text-ink-muted grid size-11 shrink-0 place-items-center rounded-full"
									}
								>
									{user.role === "root" ? (
										<ShieldCheck aria-hidden size={20} />
									) : (
										<UserRound aria-hidden size={20} />
									)}
								</span>
								<div className="min-w-0 flex-1 overflow-hidden">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="truncate text-sm font-semibold sm:text-base">
											{user.displayName}
										</h3>
										<Badge
											className={
												user.role === "root"
													? "border-accent/20 bg-accent/10 text-accent"
													: user.role === "admin"
														? "border-positive/20 bg-positive/10 text-positive-strong"
														: undefined
											}
										>
											{ROLE_LABELS[user.role]}
										</Badge>
										{isCurrent ? <span className="text-ink-faint text-xs">Tú</span> : null}
									</div>
									<p className="text-ink-muted mt-1 truncate text-xs">@{user.username}</p>
									{user.role === "user" ? (
										<>
											<p className="text-ink-muted mt-1 flex items-center gap-1.5 truncate text-xs">
												<Mail aria-hidden size={13} /> {user.email ?? "Correo pendiente"}
											</p>
											<p className="text-ink-muted mt-1 flex items-center gap-1.5 truncate text-xs">
												<Landmark aria-hidden size={13} />{" "}
												{user.bankAccount
													? `${user.bankAccount.bankName} · ${user.bankAccount.accountType}`
													: "Datos bancarios pendientes"}
											</p>
										</>
									) : null}
								</div>
								<div className="border-line col-span-2 flex w-full shrink-0 items-center justify-end gap-1 border-t pt-2 sm:w-auto sm:border-0 sm:pt-0">
									{user.role === "user" ? (
										<>
											<Button
												aria-label={`Administrar datos bancarios de ${user.displayName}`}
												className="size-11 shrink-0 p-0"
												disabled={pending}
												onClick={() => {
													setNotice("");
													setBankUser(user);
												}}
												variant="ghost"
											>
												<Landmark aria-hidden size={17} />
											</Button>
											<Button
												aria-label={`Editar a ${user.displayName}`}
												className="size-11 shrink-0 p-0"
												disabled={pending}
												onClick={() => openEditor(user)}
												variant="ghost"
											>
												<Pencil aria-hidden size={17} />
											</Button>
										</>
									) : null}
									{isRoot ? (
										<span
											className="text-ink-faint flex items-center gap-1.5 text-xs"
											title="El usuario root no se puede eliminar"
										>
											<LockKeyhole aria-hidden size={15} /> Protegido
										</span>
									) : !isCurrent ? (
										<Button
											aria-label={`Eliminar a ${user.displayName}`}
											className="size-11 shrink-0 p-0"
											disabled={pending}
											onClick={() => setDeletingUser(user)}
											variant="ghost"
										>
											<Trash2 aria-hidden size={18} />
										</Button>
									) : null}
								</div>
							</article>
						);
					})}
				</div>
			</section>

			<Dialog
				description={
					deletingUser
						? `Se cerrará el acceso de @${deletingUser.username}. Su actividad histórica se conservará.`
						: undefined
				}
				onClose={() => setDeletingUser(null)}
				open={Boolean(deletingUser)}
				title="Eliminar acceso"
			>
				<div className="flex justify-end gap-3">
					<Button disabled={pending} onClick={() => setDeletingUser(null)} variant="secondary">
						Cancelar
					</Button>
					<Button disabled={pending} onClick={confirmDelete} variant="danger">
						<Trash2 aria-hidden size={17} /> {pending ? "Eliminando…" : "Eliminar"}
					</Button>
				</div>
			</Dialog>

			<Dialog
				description={
					editingUser
						? `Actualiza los datos con los que @${editingUser.username} entra a la plataforma.`
						: undefined
				}
				onClose={closeEditor}
				open={Boolean(editingUser)}
				title="Editar acceso"
			>
				{editingUser ? (
					<form action={submitEdit} className="grid gap-5">
						<Field
							defaultValue={editingUser.displayName}
							error={editFieldErrors.displayName?.[0]}
							id="edit-displayName"
							label="Nombre visible"
							name="displayName"
							required
						/>
						<Field
							autoCapitalize="none"
							autoComplete="off"
							defaultValue={editingUser.username}
							error={editFieldErrors.username?.[0]}
							id="edit-username"
							label="Usuario"
							name="username"
							required
						/>
						<Field
							autoCapitalize="none"
							autoComplete="email"
							defaultValue={editingUser.email ?? ""}
							error={editFieldErrors.email?.[0]}
							id="edit-email"
							label="Correo"
							name="email"
							required
							type="email"
						/>
						<Field
							autoComplete="new-password"
							error={editFieldErrors.password?.[0]}
							hint="Déjala en blanco para conservar la contraseña actual."
							id="edit-password"
							label="Nueva contraseña"
							minLength={12}
							name="password"
							type="password"
						/>
						{editError ? (
							<p
								className="border-danger/20 bg-danger/8 text-danger rounded-xl border px-4 py-3 text-sm"
								role="alert"
							>
								{editError}
							</p>
						) : null}
						<div className="flex justify-end gap-3 pt-1">
							<Button disabled={pending} onClick={closeEditor} variant="secondary">
								Cancelar
							</Button>
							<Button disabled={pending} type="submit">
								<Save aria-hidden size={17} /> {pending ? "Guardando…" : "Guardar cambios"}
							</Button>
						</div>
					</form>
				) : null}
			</Dialog>

			{bankUser ? (
				<ParticipantBankAccountDialog
					onClose={() => setBankUser(null)}
					onRemoved={removeBankAccount}
					onSaved={saveBankAccount}
					user={bankUser}
				/>
			) : null}
		</div>
	);
}
