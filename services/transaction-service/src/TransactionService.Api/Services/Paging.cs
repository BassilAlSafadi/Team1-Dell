namespace TransactionService.Api.Services;

/// <summary>
/// Shared page/pageSize clamping so no endpoint can be asked for an unbounded result set.
/// Mirrors auth-service's ReviewService, which already did this correctly.
/// </summary>
internal static class Paging
{
    public static (int Page, int PageSize) Clamp(int page, int pageSize, int maxPageSize)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 20 : Math.Min(pageSize, maxPageSize);
        return (page, pageSize);
    }
}
