export const PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF8sAAAAASUVORK5CYII=";
export const PNG_BYTES = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0));
