'use client';

import { ROLE_LABELS, type OrganizationRole, type Permission } from '@siteops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MailPlus, MoreHorizontal, TriangleAlert, UserMinus } from 'lucide-react';
import { useState } from 'react';

import { InviteMemberForm } from './invite-member-form';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError } from '@/lib/api-client';
import {
  fetchMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  type MembersView as MembersViewData,
} from '@/lib/organizations';
import { queryKeys } from '@/lib/query-keys';

const ASSIGNABLE_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'member'];

export interface MembersViewProps {
  readonly organizationId: string;
  readonly permissions: readonly Permission[];
  readonly currentUserId: string;
}

export function MembersView({
  organizationId,
  permissions,
  currentUserId,
}: MembersViewProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const canInvite = permissions.includes('member:invite');
  const canManageRoles = permissions.includes('member:update_role');
  const canRemove = permissions.includes('member:remove');

  const query = useQuery({
    queryKey: queryKeys.members(organizationId),
    queryFn: () => fetchMembers(organizationId),
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.members(organizationId) });
  };

  const onMutationError = (error: Error): void => {
    setActionError(
      error instanceof ApiError ? error.message : 'Something went wrong. Try again shortly.',
    );
  };

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrganizationRole }) =>
      updateMemberRole(organizationId, memberId, role),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: onMutationError,
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember(organizationId, memberId),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: onMutationError,
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(organizationId, invitationId),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: onMutationError,
  });

  if (query.isPending) {
    return <MembersSkeleton />;
  }

  if (query.isError) {
    return (
      <Alert variant="error" title="Could not load members">
        {query.error instanceof ApiError
          ? query.error.message
          : 'Something went wrong loading this organization.'}
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  const data: MembersViewData = query.data;
  const busy = roleMutation.isPending || removeMutation.isPending || revokeMutation.isPending;

  return (
    <div className="grid gap-6">
      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      {canInvite ? (
        <InviteMemberForm
          organizationId={organizationId}
          onInvited={() => {
            setActionError(null);
            void invalidate();
          }}
        />
      ) : null}

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-sm font-medium">
          Members
          <span className="ml-2 font-normal text-muted-foreground">{data.members.length}</span>
        </h2>

        <ul className="mt-3 divide-y rounded-xl border">
          {data.members.map((member) => {
            const isSelf = member.userId === currentUserId;
            // Changing your own role is refused by the API, so the control is
            // not offered here either.
            const showMenu = (canManageRoles && !isSelf) || canRemove;

            return (
              <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.name}
                    {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>

                <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>

                {showMenu ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={busy}
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                      <span className="sr-only">Manage {member.name}</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canManageRoles && !isSelf ? (
                        <>
                          <DropdownMenuLabel>Role</DropdownMenuLabel>
                          {ASSIGNABLE_ROLES.map((role) => (
                            <DropdownMenuCheckItem
                              key={role}
                              checked={member.role === role}
                              onSelect={() => {
                                if (member.role === role) return;
                                roleMutation.mutate({ memberId: member.id, role });
                              }}
                            >
                              {ROLE_LABELS[role]}
                            </DropdownMenuCheckItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      ) : null}

                      {canRemove ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            removeMutation.mutate(member.id);
                          }}
                        >
                          <UserMinus aria-hidden="true" />
                          {isSelf ? 'Leave organization' : 'Remove from organization'}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {data.invitations.length > 0 ? (
        <section aria-labelledby="invitations-heading">
          <h2 id="invitations-heading" className="text-sm font-medium">
            Pending invitations
            <span className="ml-2 font-normal text-muted-foreground">
              {data.invitations.length}
            </span>
          </h2>

          <ul className="mt-3 divide-y rounded-xl border">
            {data.invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                <MailPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited by {invitation.invitedByName}
                  </p>
                </div>
                <Badge variant="outline">{ROLE_LABELS[invitation.role]}</Badge>
                {canInvite ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      revokeMutation.mutate(invitation.id);
                    }}
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!canInvite && data.members.length === 1 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="size-4" aria-hidden="true" />
          Only an owner or admin can invite people to this organization.
        </p>
      ) : null}
    </div>
  );
}

function MembersSkeleton(): React.ReactElement {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading members…</span>
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Loading members…</span>
      </div>
      <div className="divide-y rounded-xl border">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="h-3.5 w-32 rounded bg-muted" />
              <div className="mt-1.5 h-3 w-48 rounded bg-muted" />
            </div>
            <div className="h-5 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
