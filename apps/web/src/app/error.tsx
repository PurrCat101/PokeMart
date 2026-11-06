"use client";

import { useEffect } from "react";
import { ErrorPage } from "../components/ErrorPage";

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorPage
      fullScreen
      title="Something went wrong"
      message="An unexpected error stopped this page from loading. Try again, or come back in a moment."
      code={error.digest}
      onRetry={retry}
    />
  );
}
