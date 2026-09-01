"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/client";

export function DeleteExpenseButton({
	expenseId,
	expenseName,
}: {
	expenseId: string;
	expenseName: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [error, setError] = useState("");
	const [pending, startTransition] = useTransition();
	function remove() {
		startTransition(async () => {
			const result = await apiRequest<null>(`/api/expenses/${expenseId}`, { method: "DELETE" });
			if (result.err) {
				setError(result.val.message);
				return;
			}
			router.replace("/expenses");
			router.refresh();
		});
	}
	return (
		<>
			<Button onClick={() => setOpen(true)} variant="danger">
				<Trash2 aria-hidden size={16} /> Eliminar gasto
			</Button>
			<Dialog
				description={`“${expenseName}” dejará de aparecer en listas y balances. El comprobante se conservará para auditoría.`}
				onClose={() => setOpen(false)}
				open={open}
				title="¿Eliminar este gasto?"
			>
				<div className="flex justify-end gap-3">
					<Button disabled={pending} onClick={() => setOpen(false)} variant="secondary">
						Cancelar
					</Button>
					<Button disabled={pending} onClick={remove} variant="danger">
						{pending ? "Eliminando gasto…" : "Eliminar gasto"}
					</Button>
				</div>
				{error ? (
					<p className="text-danger mt-3 text-sm" role="alert">
						{error}
					</p>
				) : null}
			</Dialog>
		</>
	);
}
