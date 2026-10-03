import './globals.css';

export const metadata = {
  title: 'Diagram Workbench',
  description: 'Extract diagrams from Markdown documentation and edit them as real, individual diagram objects.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
