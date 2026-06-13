import { AppShellLayout } from "@/components/AppShell";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppShellLayout>{children}</AppShellLayout>;
}
