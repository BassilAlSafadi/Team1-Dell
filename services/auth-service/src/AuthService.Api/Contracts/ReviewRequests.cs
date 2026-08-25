namespace AuthService.Api.Contracts;

public record UpsertReviewRequest(short Rating, string? Comment);
