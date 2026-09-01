import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

export const responsiveViewports = [
	{ height: 640, label: "small-phone-short", width: 320 },
	{ height: 700, label: "small-phone-tall", width: 320 },
	{ height: 640, label: "phone-short", width: 360 },
	{ height: 800, label: "phone-tall", width: 360 },
	{ height: 844, label: "large-phone", width: 390 },
	{ height: 1024, label: "tablet-portrait", width: 768 },
	{ height: 768, label: "tablet-landscape", width: 1024 },
	{ height: 900, label: "desktop", width: 1440 },
] as const;

export async function expectNoHorizontalOverflow(page: Page, context: string): Promise<void> {
	const result = await page.evaluate(() => {
		const viewportWidth = document.documentElement.clientWidth;
		const overflow =
			Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewportWidth;
		const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
			.flatMap((element) => {
				const rect = element.getBoundingClientRect();
				return rect.right > viewportWidth + 1 || rect.left < -1
					? [
							{
								className: element.className.toString().slice(0, 120),
								tagName: element.tagName,
								left: Math.round(rect.left),
								right: Math.round(rect.right),
							},
						]
					: [];
			})
			.slice(0, 5);
		return { offenders, overflow };
	});

	expect(
		result.overflow,
		`${context} overflowed by ${result.overflow}px. Offenders: ${JSON.stringify(result.offenders)}`,
	).toBeLessThanOrEqual(1);
}

export async function expectNoHorizontalOverflowWithin(
	locator: Locator,
	context: string,
): Promise<void> {
	const offenders = await locator.evaluate((root) =>
		[root, ...root.querySelectorAll("*")]
			.flatMap((element) => {
				if (!(element instanceof HTMLElement)) return [];
				if (["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName)) return [];
				const overflow = element.scrollWidth - element.clientWidth;
				return overflow > 1
					? [
							{
								className: element.className.toString().slice(0, 120),
								overflow,
								tagName: element.tagName,
							},
						]
					: [];
			})
			.slice(0, 5),
	);

	expect(
		offenders,
		`${context} contained horizontal overflow: ${JSON.stringify(offenders)}`,
	).toEqual([]);
}

export async function expectMinimumTouchTarget(
	locator: Locator,
	context: string,
	minimum = 44,
): Promise<void> {
	const box = await locator.boundingBox();
	expect(box, `${context} must have a rendered bounding box`).not.toBeNull();
	expect(box!.height, `${context} must be at least ${minimum}px tall`).toBeGreaterThanOrEqual(
		minimum,
	);
	expect(box!.width, `${context} must be at least ${minimum}px wide`).toBeGreaterThanOrEqual(
		minimum,
	);
}

export async function expectNoAccessibilityViolations(page: Page, context: string): Promise<void> {
	const { violations } = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.analyze();
	const details = violations
		.map(
			(violation) =>
				`${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes
					.map((node) => node.target.join(" "))
					.join(", ")}`,
		)
		.join("\n");
	expect(violations, `${context} accessibility violations:\n${details}`).toEqual([]);
}
