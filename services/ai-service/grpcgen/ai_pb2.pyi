from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ClassifyWasteRequest(_message.Message):
    __slots__ = ("user_id", "image_data", "image_name", "business_location")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    IMAGE_DATA_FIELD_NUMBER: _ClassVar[int]
    IMAGE_NAME_FIELD_NUMBER: _ClassVar[int]
    BUSINESS_LOCATION_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    image_data: bytes
    image_name: str
    business_location: str
    def __init__(self, user_id: _Optional[str] = ..., image_data: _Optional[bytes] = ..., image_name: _Optional[str] = ..., business_location: _Optional[str] = ...) -> None: ...

class DetectedItem(_message.Message):
    __slots__ = ("description", "category", "confidence", "material_evidence")
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    MATERIAL_EVIDENCE_FIELD_NUMBER: _ClassVar[int]
    description: str
    category: str
    confidence: float
    material_evidence: str
    def __init__(self, description: _Optional[str] = ..., category: _Optional[str] = ..., confidence: _Optional[float] = ..., material_evidence: _Optional[str] = ...) -> None: ...

class Vendor(_message.Message):
    __slots__ = ("name", "offer_price", "location", "pickup_available")
    NAME_FIELD_NUMBER: _ClassVar[int]
    OFFER_PRICE_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    PICKUP_AVAILABLE_FIELD_NUMBER: _ClassVar[int]
    name: str
    offer_price: float
    location: str
    pickup_available: bool
    def __init__(self, name: _Optional[str] = ..., offer_price: _Optional[float] = ..., location: _Optional[str] = ..., pickup_available: bool = ...) -> None: ...

class VendorList(_message.Message):
    __slots__ = ("vendors",)
    VENDORS_FIELD_NUMBER: _ClassVar[int]
    vendors: _containers.RepeatedCompositeFieldContainer[Vendor]
    def __init__(self, vendors: _Optional[_Iterable[_Union[Vendor, _Mapping]]] = ...) -> None: ...

class ClassifyWasteResponse(_message.Message):
    __slots__ = ("classification_id", "primary_category", "confidence", "items", "is_mixed", "hazard_flag", "hazard_reason", "contamination_notes", "reasoning", "needs_review", "vendors_by_category")
    class VendorsByCategoryEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: VendorList
        def __init__(self, key: _Optional[str] = ..., value: _Optional[_Union[VendorList, _Mapping]] = ...) -> None: ...
    CLASSIFICATION_ID_FIELD_NUMBER: _ClassVar[int]
    PRIMARY_CATEGORY_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    ITEMS_FIELD_NUMBER: _ClassVar[int]
    IS_MIXED_FIELD_NUMBER: _ClassVar[int]
    HAZARD_FLAG_FIELD_NUMBER: _ClassVar[int]
    HAZARD_REASON_FIELD_NUMBER: _ClassVar[int]
    CONTAMINATION_NOTES_FIELD_NUMBER: _ClassVar[int]
    REASONING_FIELD_NUMBER: _ClassVar[int]
    NEEDS_REVIEW_FIELD_NUMBER: _ClassVar[int]
    VENDORS_BY_CATEGORY_FIELD_NUMBER: _ClassVar[int]
    classification_id: str
    primary_category: str
    confidence: float
    items: _containers.RepeatedCompositeFieldContainer[DetectedItem]
    is_mixed: bool
    hazard_flag: bool
    hazard_reason: str
    contamination_notes: str
    reasoning: str
    needs_review: bool
    vendors_by_category: _containers.MessageMap[str, VendorList]
    def __init__(self, classification_id: _Optional[str] = ..., primary_category: _Optional[str] = ..., confidence: _Optional[float] = ..., items: _Optional[_Iterable[_Union[DetectedItem, _Mapping]]] = ..., is_mixed: bool = ..., hazard_flag: bool = ..., hazard_reason: _Optional[str] = ..., contamination_notes: _Optional[str] = ..., reasoning: _Optional[str] = ..., needs_review: bool = ..., vendors_by_category: _Optional[_Mapping[str, VendorList]] = ...) -> None: ...

class GetRecommendationRequest(_message.Message):
    __slots__ = ("user_id", "scan_limit")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    SCAN_LIMIT_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    scan_limit: int
    def __init__(self, user_id: _Optional[str] = ..., scan_limit: _Optional[int] = ...) -> None: ...

class GetRecommendationResponse(_message.Message):
    __slots__ = ("recommendation_text", "generated_at")
    RECOMMENDATION_TEXT_FIELD_NUMBER: _ClassVar[int]
    GENERATED_AT_FIELD_NUMBER: _ClassVar[int]
    recommendation_text: str
    generated_at: _timestamp_pb2.Timestamp
    def __init__(self, recommendation_text: _Optional[str] = ..., generated_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class ChatRequest(_message.Message):
    __slots__ = ("user_id", "message", "thread_id", "media_data", "media_type", "media_name")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    MEDIA_DATA_FIELD_NUMBER: _ClassVar[int]
    MEDIA_TYPE_FIELD_NUMBER: _ClassVar[int]
    MEDIA_NAME_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    message: str
    thread_id: str
    media_data: bytes
    media_type: str
    media_name: str
    def __init__(self, user_id: _Optional[str] = ..., message: _Optional[str] = ..., thread_id: _Optional[str] = ..., media_data: _Optional[bytes] = ..., media_type: _Optional[str] = ..., media_name: _Optional[str] = ...) -> None: ...

class ChatResponse(_message.Message):
    __slots__ = ("reply", "thread_id")
    REPLY_FIELD_NUMBER: _ClassVar[int]
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    reply: str
    thread_id: str
    def __init__(self, reply: _Optional[str] = ..., thread_id: _Optional[str] = ...) -> None: ...

class ChatChunk(_message.Message):
    __slots__ = ("text_delta", "thread_id", "done", "reset")
    TEXT_DELTA_FIELD_NUMBER: _ClassVar[int]
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    DONE_FIELD_NUMBER: _ClassVar[int]
    RESET_FIELD_NUMBER: _ClassVar[int]
    text_delta: str
    thread_id: str
    done: bool
    reset: bool
    def __init__(self, text_delta: _Optional[str] = ..., thread_id: _Optional[str] = ..., done: bool = ..., reset: bool = ...) -> None: ...

class ChatThreadSummary(_message.Message):
    __slots__ = ("thread_id", "title", "created_at", "updated_at")
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    thread_id: str
    title: str
    created_at: _timestamp_pb2.Timestamp
    updated_at: _timestamp_pb2.Timestamp
    def __init__(self, thread_id: _Optional[str] = ..., title: _Optional[str] = ..., created_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ..., updated_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class ChatHistoryMessage(_message.Message):
    __slots__ = ("role", "content", "media_name", "media_type", "created_at")
    ROLE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    MEDIA_NAME_FIELD_NUMBER: _ClassVar[int]
    MEDIA_TYPE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    role: str
    content: str
    media_name: str
    media_type: str
    created_at: _timestamp_pb2.Timestamp
    def __init__(self, role: _Optional[str] = ..., content: _Optional[str] = ..., media_name: _Optional[str] = ..., media_type: _Optional[str] = ..., created_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class ListChatThreadsRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class ListChatThreadsResponse(_message.Message):
    __slots__ = ("threads",)
    THREADS_FIELD_NUMBER: _ClassVar[int]
    threads: _containers.RepeatedCompositeFieldContainer[ChatThreadSummary]
    def __init__(self, threads: _Optional[_Iterable[_Union[ChatThreadSummary, _Mapping]]] = ...) -> None: ...

class GetChatThreadRequest(_message.Message):
    __slots__ = ("user_id", "thread_id")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    thread_id: str
    def __init__(self, user_id: _Optional[str] = ..., thread_id: _Optional[str] = ...) -> None: ...

class GetChatThreadResponse(_message.Message):
    __slots__ = ("thread_id", "title", "messages")
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    MESSAGES_FIELD_NUMBER: _ClassVar[int]
    thread_id: str
    title: str
    messages: _containers.RepeatedCompositeFieldContainer[ChatHistoryMessage]
    def __init__(self, thread_id: _Optional[str] = ..., title: _Optional[str] = ..., messages: _Optional[_Iterable[_Union[ChatHistoryMessage, _Mapping]]] = ...) -> None: ...

class DeleteChatThreadRequest(_message.Message):
    __slots__ = ("user_id", "thread_id")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    thread_id: str
    def __init__(self, user_id: _Optional[str] = ..., thread_id: _Optional[str] = ...) -> None: ...

class DeleteChatThreadResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
