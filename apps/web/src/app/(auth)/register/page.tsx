import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create your account',
};

export default function RegisterPage(): React.ReactElement {
  return (
    <>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
