from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GetDealRequest(_message.Message):
    __slots__ = ("deal_id",)
    DEAL_ID_FIELD_NUMBER: _ClassVar[int]
    deal_id: str
    def __init__(self, deal_id: _Optional[str] = ...) -> None: ...

class DealResponse(_message.Message):
    __slots__ = ("deal_id", "offer_id", "listing_id", "buyer_id", "seller_id", "agreed_amount", "currency", "status", "created_at", "completed_at", "cancelled_at")
    DEAL_ID_FIELD_NUMBER: _ClassVar[int]
    OFFER_ID_FIELD_NUMBER: _ClassVar[int]
    LISTING_ID_FIELD_NUMBER: _ClassVar[int]
    BUYER_ID_FIELD_NUMBER: _ClassVar[int]
    SELLER_ID_FIELD_NUMBER: _ClassVar[int]
    AGREED_AMOUNT_FIELD_NUMBER: _ClassVar[int]
    CURRENCY_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    COMPLETED_AT_FIELD_NUMBER: _ClassVar[int]
    CANCELLED_AT_FIELD_NUMBER: _ClassVar[int]
    deal_id: str
    offer_id: str
    listing_id: str
    buyer_id: str
    seller_id: str
    agreed_amount: str
    currency: str
    status: str
    created_at: _timestamp_pb2.Timestamp
    completed_at: _timestamp_pb2.Timestamp
    cancelled_at: _timestamp_pb2.Timestamp
    def __init__(self, deal_id: _Optional[str] = ..., offer_id: _Optional[str] = ..., listing_id: _Optional[str] = ..., buyer_id: _Optional[str] = ..., seller_id: _Optional[str] = ..., agreed_amount: _Optional[str] = ..., currency: _Optional[str] = ..., status: _Optional[str] = ..., created_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ..., completed_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ..., cancelled_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class GetWalletRequest(_message.Message):
    __slots__ = ("wallet_id",)
    WALLET_ID_FIELD_NUMBER: _ClassVar[int]
    wallet_id: str
    def __init__(self, wallet_id: _Optional[str] = ...) -> None: ...

class WalletResponse(_message.Message):
    __slots__ = ("wallet_id", "user_id", "balance", "currency", "status", "created_at", "updated_at")
    WALLET_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    BALANCE_FIELD_NUMBER: _ClassVar[int]
    CURRENCY_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    wallet_id: str
    user_id: str
    balance: str
    currency: str
    status: str
    created_at: _timestamp_pb2.Timestamp
    updated_at: _timestamp_pb2.Timestamp
    def __init__(self, wallet_id: _Optional[str] = ..., user_id: _Optional[str] = ..., balance: _Optional[str] = ..., currency: _Optional[str] = ..., status: _Optional[str] = ..., created_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ..., updated_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...
