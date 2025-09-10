'use client';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">Page Not Found</h1>
        <p className="text-gray-600">The page you’re looking for doesn’t exist.</p>
        <Link href="/" className="btn">Go Home</Link>
      </div>
    </div>
  );
}
