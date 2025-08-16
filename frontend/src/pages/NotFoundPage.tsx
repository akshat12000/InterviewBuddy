export default function NotFoundPage() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-4 py-10 text-center">
      <div className="grid gap-4">
        <div className="text-7xl font-extrabold text-neutral-600">404</div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-neutral-400">The page you are looking for doesn’t exist or was moved.</p>
        <a href="/" className="btn btn-primary justify-center">Back to Home</a>
      </div>
    </div>
  )
}
