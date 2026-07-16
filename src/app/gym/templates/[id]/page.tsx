import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archiveTemplateAction, updateTemplateAction } from "@/app/gym/actions";
import { AppHeader } from "@/components/app-header";
import { TemplateEditor } from "@/components/gym/template-editor";
import { requireUser } from "@/lib/auth";
import { getTemplate } from "@/lib/data/gym";

export const metadata: Metadata = { title: "LIFEOS — TEMPLATE" };

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const template = await getTemplate(user.id, id);
  if (!template) notFound();

  return (
    <>
      <AppHeader active="gym" />
      <main className="mx-auto w-full max-w-[640px] p-4">
        <TemplateEditor
          action={updateTemplateAction}
          deleteAction={archiveTemplateAction}
          id={template.id}
          initialName={template.name}
          initialExercises={template.exercises}
        />
      </main>
    </>
  );
}
