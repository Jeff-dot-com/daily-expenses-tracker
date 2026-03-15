import { Expense } from "@/entities/Expense";
import { supabase } from "@/lib/supabase";

/** ---------- Create single expense ----------*/
export async function createExpense(
  expense: Omit<Expense, "createdAt" | "updatedAt">,
) {
  if (!supabase) throw new Error("Supabase not initialized");
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      ...expense,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** ---------- saveALL ----------*/
export async function saveAll(expenses: Expense[]) {
  if (!supabase) throw new Error("Supabase not initialized");
  const expensesToSave = expenses.map(({ id, amount, memberId, categoryId, tagId, date, description, createdAt }) => ({
    id,
    amount,
    memberId,
    categoryId,
    tagId,
    date,
    description,
    createdAt,
    updatedAt: new Date().toISOString(),
  }));
  const { data, error } = await supabase
    .from("expenses")
    .upsert(expensesToSave, { onConflict: "id" })
    .select();

  if (error) throw error;
  return data;
}

/** ---------- DELETE Expense ----------*/
export async function deleteExpense(id: string) {
  if (!supabase) throw new Error("Supabase not initialized");
  const { error } = await supabase.from("expenses").delete().eq("id", id);

  if (error) throw error;
}

export async function deleteExpenses(ids: string[]) {
  if (!supabase) throw new Error("Supabase not initialized");
  const { error } = await supabase.from("expenses").delete().in("id", ids);

  if (error) throw error;
}
