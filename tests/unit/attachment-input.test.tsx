// @vitest-environment jsdom

import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachmentInput } from "@/components/ui/attachment-input";
import { RECEIPT_CONTENT_TYPES } from "@/lib/const/receipts";

const props = {
	accept: RECEIPT_CONTENT_TYPES,
	hint: "JPG, PNG, WebP o PDF · máximo 10 MB",
	label: "Comprobante",
};

function clipboard(read?: () => Promise<ClipboardItem[]>) {
	vi.stubGlobal("navigator", { clipboard: { read } });
}

function imageItem(type = "image/png"): ClipboardItem {
	return {
		types: [type],
		getType: vi.fn().mockResolvedValue(new Blob(["image"], { type })),
	} as unknown as ClipboardItem;
}

function paste(files: File[]) {
	const button = screen.getByRole("button", { name: "Pegar imagen" });
	const event = createEvent.paste(button, { clipboardData: { files } });
	fireEvent(button, event);
	return event;
}

function StatefulInput() {
	const [file, setFile] = useState<File | null>(null);
	return (
		<AttachmentInput {...props} file={file} onChange={setFile} onClear={() => setFile(null)} />
	);
}

describe("attachment input", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("reads an image on demand and gives it a filename matching its type", async () => {
		const read = vi.fn().mockResolvedValue([imageItem("image/webp")]);
		clipboard(read);
		const onChange = vi.fn();
		render(<AttachmentInput {...props} onChange={onChange} />);
		expect(read).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Pegar imagen" }));
		await act(async () => {});
		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange.mock.calls[0][0]).toMatchObject({
			name: "imagen-pegada.webp",
			type: "image/webp",
			size: 5,
		});
	});

	it("lets a pasted image replace a picked file, then clears or replaces the selection", () => {
		render(<StatefulInput />);
		expect(screen.getByRole("group", { name: "Comprobante" })).toBeVisible();
		expect(screen.getAllByRole("button")).toHaveLength(2);
		const input = screen.getByLabelText("Comprobante");
		const pdf = new File(["pdf"], "boleta.pdf", { type: "application/pdf" });
		fireEvent.change(input, { target: { files: [pdf] } });
		expect(screen.getByRole("status")).toHaveTextContent("boleta.pdf");
		const event = paste([new File(["png"], "captura.png", { type: "image/png" })]);
		expect(event.defaultPrevented).toBe(true);
		expect(screen.getByRole("status")).toHaveTextContent("captura.png");
		fireEvent.change(input, { target: { files: [pdf] } });
		expect(screen.getByRole("status")).toHaveTextContent("boleta.pdf");
		fireEvent.click(screen.getByRole("button", { name: "Quitar archivo seleccionado" }));
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("leaves text paste alone and uses only the first pasted image", () => {
		const onChange = vi.fn();
		render(<AttachmentInput {...props} onChange={onChange} />);
		expect(paste([]).defaultPrevented).toBe(false);
		expect(onChange).not.toHaveBeenCalled();
		const first = new File(["png"], "first.png", { type: "image/png" });
		paste([first, new File(["png"], "second.png", { type: "image/png" })]);
		expect(onChange).toHaveBeenCalledExactlyOnceWith(first);
	});

	it.each(["unsupported", "denied"])(
		"keeps keyboard paste working when clipboard reading is %s",
		async (reason) => {
			clipboard(
				reason === "denied"
					? vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
					: undefined,
			);
			const onChange = vi.fn();
			render(<AttachmentInput {...props} onChange={onChange} />);
			fireEvent.click(screen.getByRole("button", { name: "Pegar imagen" }));
			expect(await screen.findByRole("alert")).toHaveTextContent("Ctrl+V o ⌘V");
			paste([new File(["image"], "captura.png", { type: "image/png" })]);
			expect(onChange).toHaveBeenCalledOnce();
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		},
	);

	it("explains when the clipboard has no image without removing the current selection", async () => {
		clipboard(vi.fn().mockResolvedValue([{ types: ["text/plain"] }]));
		render(<StatefulInput />);
		paste([new File(["image"], "captura.png", { type: "image/png" })]);
		fireEvent.click(screen.getByRole("button", { name: "Pegar imagen" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("No hay una imagen");
		expect(screen.getByRole("status")).toHaveTextContent("captura.png");
	});

	it("ignores paste while disabled", () => {
		const onChange = vi.fn();
		render(<AttachmentInput {...props} disabled onChange={onChange} />);
		paste([new File(["image"], "captura.png", { type: "image/png" })]);
		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Pegar imagen" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Elegir archivo" })).toBeDisabled();
	});

	it.each(["disabled", "unmounted"])(
		"discards clipboard reads completed after the field is %s",
		async (action) => {
			let resolve!: (items: ClipboardItem[]) => void;
			clipboard(
				() =>
					new Promise((done) => {
						resolve = done;
					}),
			);
			const onChange = vi.fn();
			const view = render(<AttachmentInput {...props} onChange={onChange} />);
			fireEvent.click(screen.getByRole("button", { name: "Pegar imagen" }));
			if (action === "disabled")
				view.rerender(<AttachmentInput {...props} disabled onChange={onChange} />);
			else view.unmount();
			await act(async () => {
				resolve([imageItem()]);
			});
			expect(onChange).not.toHaveBeenCalled();
		},
	);
});
