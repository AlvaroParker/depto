import {
	Armchair,
	Baby,
	Building2,
	BusFront,
	Car,
	Clapperboard,
	Droplets,
	Dumbbell,
	Flame,
	Gift,
	GraduationCap,
	HeartPulse,
	House,
	Lightbulb,
	PawPrint,
	Plane,
	Shapes,
	Shirt,
	ShoppingCart,
	Sparkles,
	Utensils,
	WashingMachine,
	Wifi,
	Wrench,
} from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { ExpenseKindIconKey } from "@/lib/const/expense-kinds";

export const EXPENSE_KIND_ICON_OPTIONS: readonly {
	iconKey: ExpenseKindIconKey;
	label: string;
}[] = [
	{ iconKey: "house", label: "Casa" },
	{ iconKey: "building", label: "Edificio" },
	{ iconKey: "water", label: "Agua" },
	{ iconKey: "electricity", label: "Electricidad" },
	{ iconKey: "gas", label: "Gas" },
	{ iconKey: "internet", label: "Internet" },
	{ iconKey: "groceries", label: "Compras" },
	{ iconKey: "food", label: "Comida" },
	{ iconKey: "cleaning", label: "Limpieza" },
	{ iconKey: "appliances", label: "Electrodomésticos" },
	{ iconKey: "furniture", label: "Muebles" },
	{ iconKey: "repairs", label: "Reparaciones" },
	{ iconKey: "transport", label: "Transporte" },
	{ iconKey: "health", label: "Salud" },
	{ iconKey: "pets", label: "Mascotas" },
	{ iconKey: "education", label: "Educación" },
	{ iconKey: "children", label: "Niños" },
	{ iconKey: "car", label: "Auto" },
	{ iconKey: "gift", label: "Regalos" },
	{ iconKey: "travel", label: "Viajes" },
	{ iconKey: "clothing", label: "Ropa" },
	{ iconKey: "fitness", label: "Deporte" },
	{ iconKey: "entertainment", label: "Entretención" },
	{ iconKey: "other", label: "Otros" },
];

const iconComponents: Record<ExpenseKindIconKey, LucideIcon> = {
	appliances: WashingMachine,
	building: Building2,
	car: Car,
	children: Baby,
	cleaning: Sparkles,
	clothing: Shirt,
	education: GraduationCap,
	electricity: Lightbulb,
	entertainment: Clapperboard,
	fitness: Dumbbell,
	food: Utensils,
	furniture: Armchair,
	gas: Flame,
	gift: Gift,
	groceries: ShoppingCart,
	health: HeartPulse,
	house: House,
	internet: Wifi,
	other: Shapes,
	pets: PawPrint,
	repairs: Wrench,
	transport: BusFront,
	travel: Plane,
	water: Droplets,
};

export function ExpenseKindIcon({ iconKey, ...props }: LucideProps & { iconKey: string }) {
	const Icon = iconComponents[iconKey as ExpenseKindIconKey] ?? Shapes;
	return <Icon {...props} />;
}
