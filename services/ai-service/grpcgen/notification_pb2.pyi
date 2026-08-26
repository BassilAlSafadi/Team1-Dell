from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class EntityRef(_message.Message):
    __slots__ = ("type", "id")
    TYPE_FIELD_NUMBER: _ClassVar[int]
    ID_FIELD_NUMBER: _ClassVar[int]
    type: str
    id: str
    def __init__(self, type: _Optional[str] = ..., id: _Optional[str] = ...) -> None: ...

class CreateNotificationRequest(_message.Message):
    __slots__ = ("user_id", "type", "title", "body", "actor_id", "entity")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    BODY_FIELD_NUMBER: _ClassVar[int]
    ACTOR_ID_FIELD_NUMBER: _ClassVar[int]
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    type: str
    title: str
    body: str
    actor_id: str
    entity: EntityRef
    def __init__(self, user_id: _Optional[str] = ..., type: _Optional[str] = ..., title: _Optional[str] = ..., body: _Optional[str] = ..., actor_id: _Optional[str] = ..., entity: _Optional[_Union[EntityRef, _Mapping]] = ...) -> None: ...

class CreateNotificationResponse(_message.Message):
    __slots__ = ("notification_id", "user_id", "type", "title", "body", "actor_id", "entity", "is_read", "created_at")
    NOTIFICATION_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    BODY_FIELD_NUMBER: _ClassVar[int]
    ACTOR_ID_FIELD_NUMBER: _ClassVar[int]
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    IS_READ_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    notification_id: str
    user_id: str
    type: str
    title: str
    body: str
    actor_id: str
    entity: EntityRef
    is_read: bool
    created_at: _timestamp_pb2.Timestamp
    def __init__(self, notification_id: _Optional[str] = ..., user_id: _Optional[str] = ..., type: _Optional[str] = ..., title: _Optional[str] = ..., body: _Optional[str] = ..., actor_id: _Optional[str] = ..., entity: _Optional[_Union[EntityRef, _Mapping]] = ..., is_read: bool = ..., created_at: _Optional[_Union[_timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...
