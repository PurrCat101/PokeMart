import Link from "next/link";
import { ErrorPage } from "../components/ErrorPage";
import { buttonClass } from "../components/ui";

export default function NotFound() {
  return (
    <ErrorPage
      fullScreen
      title="Page not found"
      message="The page you are looking for does not exist."
      status={404}
      testId="not-found-page"
      actions={
        <Link href="/" className={buttonClass("secondary")}>
          Back to catalog
        </Link>
      }
    />
  );
}
