import type { Metadata } from "next";
import { createTemplateAction } from "@/app/gym/actions";
import { AppHeader } from "@/components/app-header";
import { TemplateEditor } from "@/components/gym/template-editor";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "HELM — NEW TEMPLATE" };

export default async function NewTemplatePage() {
  await requireUser();
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[640px] p-4">
        <TemplateEditor action={createTemplateAction} />
      </main>
    </>
  );
}
