import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	applicationName: "La cuenta de la casa",
	description: "Gastos compartidos, comprobantes y reembolsos del hogar.",
	icons: { icon: "/favicon.svg" },
	metadataBase: new URL("https://depto.parker.ci"),
	openGraph: {
		description: "Gastos compartidos, comprobantes y reembolsos del hogar.",
		locale: "es_CL",
		siteName: "La cuenta de la casa",
		title: "La cuenta de la casa",
		type: "website",
		url: "/",
	},
	title: {
		default: "La cuenta de la casa",
		template: "%s · La cuenta de la casa",
	},
	twitter: {
		card: "summary_large_image",
		description: "Gastos compartidos, comprobantes y reembolsos del hogar.",
		title: "La cuenta de la casa",
	},
};

export const viewport: Viewport = {
	initialScale: 1,
	viewportFit: "cover",
	width: "device-width",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html data-scroll-behavior="smooth" lang="es-CL">
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
		</html>
	);
}
