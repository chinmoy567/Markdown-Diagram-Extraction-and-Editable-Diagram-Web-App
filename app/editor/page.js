'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import EditorShell from '@/components/diagram-editor/EditorShell';

function Inner() {
  const id = useSearchParams().get('id');
  if (!id) return <div className="dw-convwarn"><h2>No diagram selected</h2><Link className="dw-btn" href="/">Open the library</Link></div>;
  return <EditorShell id={id} key={id} />;
}

export default function EditorPage() {
  return <Suspense fallback={<div className="dw-loading">Opening…</div>}><Inner /></Suspense>;
}
