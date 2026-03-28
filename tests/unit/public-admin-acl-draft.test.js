// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  cloneAclRules,
  createAclDraftRegistry,
  getAclRulesSignature,
} from '../../public/js/features/admin/acl-draft.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('admin acl draft helpers', () => {
  it('clones and signatures acl rules deterministically', () => {
    const rulesA = [
      { principal_type: 'group', principal_id: 'beta', effect: 'allow', action: 'use' },
      { principal_type: 'group', principal_id: 'alpha', effect: 'deny', action: 'use' },
    ];
    const rulesB = [
      { principal_type: 'group', principal_id: 'alpha', effect: 'deny', action: 'use' },
      { principal_type: 'group', principal_id: 'beta', effect: 'allow', action: 'use' },
    ];

    const cloned = cloneAclRules(rulesA);
    expect(cloned).toEqual(rulesA);
    expect(cloned).not.toBe(rulesA);
    expect(getAclRulesSignature(rulesA)).toBe(getAclRulesSignature(rulesB));
  });

  it('stages, reads, and clears acl drafts in a reusable registry', () => {
    const state = {};
    const registry = createAclDraftRegistry(state);

    expect(registry.isDirty()).toBe(false);
    expect(state.aclDrafts).toBeInstanceOf(Map);

    registry.stage('model-1', [
      { principal_type: 'group', principal_id: 'group-1', effect: 'allow', action: 'use' },
    ]);

    expect(registry.isDirty()).toBe(true);
    expect(registry.has('model-1')).toBe(true);
    expect(registry.get('model-1')).toEqual([
      { principal_type: 'group', principal_id: 'group-1', effect: 'allow', action: 'use' },
    ]);

    registry.stage('model-2', []);
    expect(registry.isDirty()).toBe(true);
    expect(registry.get('model-2')).toEqual([]);

    registry.clear('model-1');
    expect(registry.isDirty()).toBe(true);
    expect(registry.has('model-1')).toBe(false);

    registry.clear('model-2');
    expect(registry.isDirty()).toBe(false);
  });
});
