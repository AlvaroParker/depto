import type { ParticipantBalance } from "@/lib/types/dashboard";
import { formatMoney } from "@/lib/util/format";

export function BalanceList({ balances }: { balances: ParticipantBalance[] }) {
	return (
		<section className="border-line bg-paper rounded-3xl border p-5 sm:p-6">
			<h2 className="font-display text-2xl font-semibold">Balance por persona</h2>
			<div className="divide-line mt-4 divide-y">
				{balances.map((balance) => (
					<div className="grid grid-cols-[1fr_auto] gap-3 py-4" key={balance.participant.id}>
						<div>
							<p className="font-semibold">{balance.participant.name}</p>
							<p className="text-ink-muted mt-1 text-xs">
								Pagó {formatMoney(balance.totalPaidMinor)} · Le corresponde{" "}
								{formatMoney(balance.totalShareMinor)}
							</p>
						</div>
						<strong
							className={balance.netBalanceMinor >= 0 ? "text-positive-strong" : "text-danger"}
						>
							{balance.netBalanceMinor > 0 ? "+" : ""}
							{formatMoney(balance.netBalanceMinor)}
						</strong>
					</div>
				))}
			</div>
		</section>
	);
}
