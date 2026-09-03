'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth';

export function SignOutButton(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      // The whole cache is dropped rather than just the session: everything in
      // it belongs to the person signing out.
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        mutation.mutate();
      }}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <LogOut aria-hidden="true" />
      )}
      Sign out
    </Button>
  );
}
