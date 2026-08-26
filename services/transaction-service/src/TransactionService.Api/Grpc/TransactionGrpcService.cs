using System.Globalization;
using System.Net;
using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using Transaction.V1;
using TransactionService.Api.Services;
using ContractsDeal = TransactionService.Api.Contracts.DealResponse;
using ContractsWallet = TransactionService.Api.Contracts.WalletResponse;

namespace TransactionService.Api.Grpc;

// Server-side implementation of transaction.proto's TransactionService — thin 1:1 mirrors of
// already-tested REST behavior (DealsController.Get, WalletsController.GetMine). Exposed for
// future gRPC consumers; no caller wires this yet in this pass (see plans/pure-hugging-puzzle.md).
public class TransactionGrpcService : Transaction.V1.TransactionService.TransactionServiceBase
{
    private readonly IDealService _dealService;
    private readonly IWalletService _walletService;

    public TransactionGrpcService(IDealService dealService, IWalletService walletService)
    {
        _dealService = dealService;
        _walletService = walletService;
    }

    public override async Task<DealResponse> GetDeal(GetDealRequest request, ServerCallContext context)
    {
        if (!Guid.TryParse(request.DealId, out var dealId))
        {
            throw new RpcException(new Status(StatusCode.InvalidArgument, "deal_id must be a valid GUID."));
        }

        ContractsDeal deal;
        try
        {
            deal = await _dealService.GetAsync(dealId, context.CancellationToken);
        }
        catch (TransactionDomainException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new RpcException(new Status(StatusCode.NotFound, "Deal not found."));
        }

        var response = new DealResponse
        {
            DealId = deal.DealId.ToString(),
            OfferId = deal.OfferId.ToString(),
            ListingId = deal.ListingId.ToString(),
            BuyerId = deal.BuyerId.ToString(),
            SellerId = deal.SellerId.ToString(),
            AgreedAmount = deal.AgreedAmount.ToString(CultureInfo.InvariantCulture),
            Currency = deal.Currency,
            Status = deal.Status,
            CreatedAt = Timestamp.FromDateTimeOffset(deal.CreatedAt)
        };
        if (deal.CompletedAt is { } completedAt)
        {
            response.CompletedAt = Timestamp.FromDateTimeOffset(completedAt);
        }
        if (deal.CancelledAt is { } cancelledAt)
        {
            response.CancelledAt = Timestamp.FromDateTimeOffset(cancelledAt);
        }

        return response;
    }

    public override async Task<WalletResponse> GetWallet(GetWalletRequest request, ServerCallContext context)
    {
        // IWalletService only supports lookup by the owning user's id — WalletsController/
        // IWalletService have no direct wallet-id or arbitrary-user lookup today — so wallet_id
        // here is interpreted as that owning user's id until a real by-wallet-id lookup exists.
        if (!Guid.TryParse(request.WalletId, out var userId))
        {
            throw new RpcException(new Status(StatusCode.InvalidArgument, "wallet_id must be a valid GUID (owning user id)."));
        }

        ContractsWallet wallet;
        try
        {
            wallet = await _walletService.GetWalletAsync(userId, context.CancellationToken);
        }
        catch (TransactionDomainException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new RpcException(new Status(StatusCode.NotFound, "Wallet not found."));
        }

        return new WalletResponse
        {
            WalletId = wallet.WalletId.ToString(),
            UserId = wallet.UserId.ToString(),
            Balance = wallet.Balance.ToString(CultureInfo.InvariantCulture),
            Currency = wallet.Currency,
            Status = wallet.Status,
            CreatedAt = Timestamp.FromDateTimeOffset(wallet.CreatedAt),
            UpdatedAt = Timestamp.FromDateTimeOffset(wallet.UpdatedAt)
        };
    }
}
