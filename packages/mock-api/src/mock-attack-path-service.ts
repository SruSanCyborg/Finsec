import { AttackPath } from '@sirius/types';
import { MOCK_ATTACK_PATHS } from './mock-data';

export class MockAttackPathService {
  private paths: AttackPath[] = [...MOCK_ATTACK_PATHS];

  public async getAttackPaths(projectId?: string): Promise<AttackPath[]> {
    if (projectId) {
      return this.paths.filter((p) => p.projectId === projectId);
    }
    return this.paths;
  }

  public async getAttackPathById(pathId: string): Promise<AttackPath | null> {
    return this.paths.find((p) => p.id === pathId) || this.paths[0] || null;
  }

}
