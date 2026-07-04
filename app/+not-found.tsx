import { Link, Stack } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6">
        <h1 className="text-lg font-bold text-gray-900">This screen doesn&apos;t exist.</h1>
        <Link
          href="/"
          className="mt-4 px-4 py-2.5 bg-black hover:bg-gray-800 active:bg-gray-700 text-white rounded-lg transition-all font-medium text-sm"
        >
          Go to home screen
        </Link>
      </div>
    </>
  );
}
