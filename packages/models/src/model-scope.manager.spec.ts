import { ModelScopeManager } from './model-scope.manager';
import { BaseModel } from './model.base';

class TestModel extends BaseModel {
  constructor(public name: string) {
    super(name);
  }
}

class TestModel2 extends BaseModel {
  constructor(public name: string) {
    super(name);
  }
}

class TestModel3 extends BaseModel {
  constructor(public name: string) {
    super(name);
  }
}

describe(ModelScopeManager.name, () => {
  describe('adding models', () => {
    it('should add a model to the scope', () => {
      const manager = ModelScopeManager.create();
      const model = new TestModel('test');
      manager.addModel(model);
      const model2 = new TestModel2('test2');
      manager.addModel(model2);

      expect(manager.isInScope(TestModel)).toBe(true);
      expect(manager.isInScope(TestModel2)).toBe(true);
      expect(manager.isInScope(TestModel3)).toBe(false);
    });
  });

  describe('removing models', () => {
    it('should remove a model from the scope', () => {
      const manager = ModelScopeManager.create();
      const model = new TestModel('test');
      const model2 = new TestModel('foo');
      manager.addModel(model);
      manager.addModel(model2);

      expect(manager.isInScope(TestModel)).toBe(true);
      expect(manager.countInScopeModelsOfType(TestModel)).toBe(2);

      manager.removeModel(TestModel, model.id);
      expect(manager.isInScope(TestModel, model.id)).toBe(false);
      expect(manager.isInScope(TestModel, model2.id)).toBe(true);
    });
  });

  describe('clearing the scope', () => {
    it('should clear the scope', () => {
      const manager = ModelScopeManager.create();
      const model = new TestModel('test');
      manager.addModel(model);
      manager.clearScope();

      expect(manager.isInScope(TestModel)).toBe(false);
    });
  });

  describe('reference counting', () => {
    it('should return existing model and increment ref count when adding duplicate id', () => {
      const manager = ModelScopeManager.create();
      const model = new TestModel('test');
      manager.addModel(model);

      const model2 = new TestModel('test');
      const actual = manager.addModel(model2);

      expect(actual).toBe(model);
      expect(manager.getModelOfType(TestModel, model.id)).toBe(model);
      expect(manager.countInScopeModelsOfType(TestModel)).toBe(1);
    });

    it('should only remove when ref count reaches 0', () => {
      const manager = ModelScopeManager.create();
      const model = new TestModel('test');
      manager.addModel(model);
      manager.addModel(new TestModel('test'));

      manager.removeModel(TestModel, model.id);
      expect(manager.isInScope(TestModel, model.id)).toBe(true);

      manager.removeModel(TestModel, model.id);
      expect(manager.isInScope(TestModel, model.id)).toBe(false);
    });
  });

  describe('getting models', () => {
    it('should get a model from the scope', () => {
      const manager = ModelScopeManager.create();
      const model = new TestModel('test');
      manager.addModel(model);

      expect(manager.getModelOfType(TestModel)).toBe(model);
    });

    it('should return an empty array when no models of the type are in scope', () => {
      const manager = ModelScopeManager.create();
      manager.addModel(new TestModel('test'));

      expect(manager.getInScopeModelsOfType(TestModel2)).toEqual([]);
      expect(manager.getInScopeModelsOfType(TestModel)).toMatchObject([
        { name: 'test' },
      ]);
    });
  });

  describe('given parent scope', () => {
    describe('given model in both scopes', () => {
      it('the current scope should take priority', () => {
        const manager = ModelScopeManager.create();
        const model = new TestModel('test');
        manager.addModel(model);

        const manager2 = ModelScopeManager.create(manager);
        const model2 = new TestModel('test2');
        manager2.addModel(model2);

        expect(manager2.getModelOfType(TestModel)).toBe(model2);
      });
    });

    describe('given model in parent scope only', () => {
      it('should get a model from the parent scope', () => {
        const manager = ModelScopeManager.create();
        const model = new TestModel('test');
        manager.addModel(model);

        const manager2 = ModelScopeManager.create(manager);

        expect(manager2.getModelOfType(TestModel)).toBe(model);
      });
    });
  });
});
