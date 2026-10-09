/** Bounded format failure retained as caller-visible managed coverage. */
export class ManagedReaderFailure extends Error {
    issue;
    constructor(issue, options) {
        super(issue.detail, options);
        this.issue = issue;
    }
}
/** Construct a typed managed parse failure at an exact byte location. */
export const managedFailure = (code, scope, detail, offset = null) => new ManagedReaderFailure({ code, scope, offset, detail });
