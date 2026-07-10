import { ImageResponse } from "next/og";

export const alt = "La cuenta de la casa — gastos compartidos, cuentas claras";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function BrandMark() {
	return (
		<svg aria-hidden height="72" viewBox="0 0 64 64" width="72">
			<rect fill="#bd5039" height="64" rx="15" width="64" />
			<path d="M13 29.5 32 13l19 16.5V49a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V29.5Z" fill="#fffaf2" />
			<circle cx="32" cy="36" fill="#bd5039" r="12" />
			<path
				d="M36.5 30.5c-1.2-1.1-2.7-1.7-4.7-1.7-2.7 0-4.5 1.3-4.5 3.3 0 2.1 1.7 2.9 4.8 3.6 3 .7 4.6 2 4.6 4.2 0 2.6-2.3 4.3-5.4 4.3-2.3 0-4.2-.7-5.6-2.1M32 26v21"
				fill="none"
				stroke="#fffaf2"
				strokeLinecap="round"
				strokeWidth="2.8"
			/>
		</svg>
	);
}

export default function OpenGraphImage() {
	return new ImageResponse(
		<div
			style={{
				alignItems: "stretch",
				background: "#f6f1e7",
				color: "#282822",
				display: "flex",
				flexDirection: "column",
				height: "100%",
				overflow: "hidden",
				padding: "58px 68px 54px",
				position: "relative",
				width: "100%",
			}}
		>
			<div
				style={{
					border: "2px solid rgba(189,80,57,0.26)",
					borderRadius: "999px",
					display: "flex",
					height: "420px",
					position: "absolute",
					right: "-92px",
					top: "-116px",
					width: "420px",
				}}
			/>
			<div
				style={{
					border: "2px solid rgba(57,112,90,0.24)",
					borderRadius: "999px",
					bottom: "-136px",
					display: "flex",
					height: "330px",
					position: "absolute",
					right: "110px",
					width: "330px",
				}}
			/>

			<div style={{ alignItems: "center", display: "flex", gap: "22px" }}>
				<BrandMark />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ fontFamily: "serif", fontSize: "31px", fontWeight: 700 }}>La cuenta</div>
					<div
						style={{
							color: "#69685e",
							fontSize: "15px",
							fontWeight: 700,
							letterSpacing: "0.18em",
							textTransform: "uppercase",
						}}
					>
						de la casa
					</div>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					marginTop: "78px",
					maxWidth: "850px",
					position: "relative",
				}}
			>
				<div
					style={{
						color: "#bd5039",
						fontSize: "22px",
						fontWeight: 700,
						letterSpacing: "0.04em",
					}}
				>
					Gastos compartidos, cuentas claras
				</div>
				<div
					style={{
						fontFamily: "serif",
						fontSize: "76px",
						fontWeight: 700,
						letterSpacing: "-0.04em",
						lineHeight: 0.98,
						marginTop: "18px",
					}}
				>
					Lo compartido, claro para todos.
				</div>
			</div>

			<div
				style={{
					alignItems: "center",
					borderTop: "1px solid #ddd3c4",
					color: "#69685e",
					display: "flex",
					fontSize: "18px",
					justifyContent: "space-between",
					marginTop: "auto",
					paddingTop: "24px",
				}}
			>
				<div style={{ display: "flex" }}>Gastos · comprobantes · reembolsos</div>
				<div style={{ color: "#39705a", display: "flex", fontWeight: 700 }}>depto.parker.ci</div>
			</div>
		</div>,
		{ ...size },
	);
}
