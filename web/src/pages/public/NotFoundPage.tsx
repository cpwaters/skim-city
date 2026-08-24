import { ButtonLink } from '../../components/ui/Button';
import { Logo } from '../../components/Logo';

export function NotFoundPage() {
  return (
    <div className="min-h-dvh grid place-items-center bg-noir-900 spotlight hatch px-5">
      <div className="text-center max-w-md">
        <div className="mb-10 flex justify-center">
          <Logo size="md" />
        </div>
        <p className="display text-7xl text-noir-600 mb-4">404</p>
        <h1 className="display text-2xl text-bone mb-3">Nothing here</h1>
        <p className="text-smoke mb-8">
          That page has been skimmed over. Try the home page instead.
        </p>
        <ButtonLink to="/">Back to home</ButtonLink>
      </div>
    </div>
  );
}
