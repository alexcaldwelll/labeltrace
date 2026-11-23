// Placeholder layout so the project builds (task T001).
// Task T014 replaces this with the real layout and the "AI, not a doctor" banner.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
