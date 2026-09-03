import type { OrganizationMembershipDto, OrganizationMemberDto } from '@siteops/shared';

import { apiRequest } from './api-client';

/** Organization and membership calls. All are authorized server-side. */

export interface PendingInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: 'owner' | 'admin' | 'member';
  readonly invitedByName: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface MembersView {
  readonly members: readonly OrganizationMemberDto[];
  readonly invitations: readonly PendingInvitation[];
}

export async function createOrganization(name: string): Promise<OrganizationMembershipDto> {
  return apiRequest<OrganizationMembershipDto>('/api/organizations', {
    method: 'POST',
    body: { name },
  });
}

export async function fetchMembers(organizationId: string): Promise<MembersView> {
  return apiRequest<MembersView>(`/api/organizations/${organizationId}/members`);
}

export async function inviteMember(
  organizationId: string,
  input: { readonly email: string; readonly role: 'admin' | 'member' },
): Promise<PendingInvitation> {
  return apiRequest<PendingInvitation>(`/api/organizations/${organizationId}/members`, {
    method: 'POST',
    body: input,
  });
}

export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  role: 'owner' | 'admin' | 'member',
): Promise<OrganizationMemberDto> {
  return apiRequest<OrganizationMemberDto>(
    `/api/organizations/${organizationId}/members/${memberId}`,
    { method: 'PATCH', body: { role } },
  );
}

export async function removeMember(organizationId: string, memberId: string): Promise<void> {
  await apiRequest(`/api/organizations/${organizationId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export async function revokeInvitation(
  organizationId: string,
  invitationId: string,
): Promise<void> {
  await apiRequest(`/api/organizations/${organizationId}/members/invitations/${invitationId}`, {
    method: 'DELETE',
  });
}

export async function acceptInvitation(token: string): Promise<{ organizationId: string }> {
  return apiRequest<{ organizationId: string }>('/api/invitations/accept', {
    method: 'POST',
    body: { token },
  });
}
