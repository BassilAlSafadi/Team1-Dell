from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class GetUserRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class UserResponse(_message.Message):
    __slots__ = ("user_id", "email", "email_verified", "status", "roles")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    EMAIL_VERIFIED_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    ROLES_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    email: str
    email_verified: bool
    status: str
    roles: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, user_id: _Optional[str] = ..., email: _Optional[str] = ..., email_verified: bool = ..., status: _Optional[str] = ..., roles: _Optional[_Iterable[str]] = ...) -> None: ...

class GetVendorProfileRequest(_message.Message):
    __slots__ = ("vendor_id",)
    VENDOR_ID_FIELD_NUMBER: _ClassVar[int]
    vendor_id: str
    def __init__(self, vendor_id: _Optional[str] = ...) -> None: ...

class VendorProfileResponse(_message.Message):
    __slots__ = ("vendor_id", "email", "status", "average_rating", "review_count")
    VENDOR_ID_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    AVERAGE_RATING_FIELD_NUMBER: _ClassVar[int]
    REVIEW_COUNT_FIELD_NUMBER: _ClassVar[int]
    vendor_id: str
    email: str
    status: str
    average_rating: float
    review_count: int
    def __init__(self, vendor_id: _Optional[str] = ..., email: _Optional[str] = ..., status: _Optional[str] = ..., average_rating: _Optional[float] = ..., review_count: _Optional[int] = ...) -> None: ...
