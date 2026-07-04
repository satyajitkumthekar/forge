import { Link, Stack } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <div className="flex flex-col items-center justify-center h-screen bg-paper p-6">
        <h1 className="text-lg font-bold tracking-tight text-ink">This screen doesn&apos;t exist.</h1>
        <Link
          href="/"
          className="mt-4 px-4 py-2.5 bg-ink hover:bg-ink-soft text-white rounded-ctrl transition duration-150 ease-out active:scale-[0.98] font-medium text-sm"
        >
          Go to home screen
        </Link>
      </div>
    </>
  );
}
