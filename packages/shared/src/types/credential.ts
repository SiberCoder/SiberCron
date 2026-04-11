/** Credential types for secure integration storage */

export interface ICredential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICredentialWithData extends ICredential {
  data: Record<string, unknown>;
}

export interface ICredentialType {
  name: string;
  displayName: string;
  icon: string;
  properties: Array<{
    name: string;
    displayName: string;
    type: 'string' | 'password';
    required: boolean;
    placeholder?: string;
  }>;
}
