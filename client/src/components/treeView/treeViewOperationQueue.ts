export class TreeViewOperationQueue {
  public enqueue<TResult>(operation: () => Promise<TResult> | TResult): Promise<TResult> {
    return Promise.resolve().then(operation);
  }
}