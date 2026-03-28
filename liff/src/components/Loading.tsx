interface Props {
  message?: string;
}

export default function Loading({ message = "読み込み中..." }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-50">
      <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-green-700 font-medium">{message}</p>
    </div>
  );
}
