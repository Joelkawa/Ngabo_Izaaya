from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Person(Base):
    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    # Core Information
    first_name = Column(String(100), nullable=False, index=True)
    middle_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=False, index=True)
    
    # Family Relationships (for dynamic linking)
    father_name = Column(String(200), nullable=True)  # Full name for searching
    mother_name = Column(String(200), nullable=True)  # Full name for searching  
    spouse_name = Column(String(200), nullable=True)  # Full name for searching
    
    # System Fields
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_verified = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user_account = relationship("UserModel", foreign_keys=[user_id])
    creator = relationship("UserModel", foreign_keys=[created_by])
    
    # Family relationships
    father_relations = relationship("FamilyRelationship", 
                                  foreign_keys="[FamilyRelationship.child_id]",
                                  primaryjoin="and_(FamilyRelationship.child_id==Person.id, "
                                              "FamilyRelationship.relationship_type=='parent', "
                                              "FamilyRelationship.parent_gender=='male')",
                                  viewonly=True)
    
    mother_relations = relationship("FamilyRelationship", 
                                  foreign_keys="[FamilyRelationship.child_id]",
                                  primaryjoin="and_(FamilyRelationship.child_id==Person.id, "
                                              "FamilyRelationship.relationship_type=='parent', "
                                              "FamilyRelationship.parent_gender=='female')",
                                  viewonly=True)
    
    spouse_relations = relationship("FamilyRelationship",
                                  foreign_keys="[FamilyRelationship.person1_id]",
                                  primaryjoin="and_(FamilyRelationship.person1_id==Person.id, "
                                              "FamilyRelationship.relationship_type=='spouse')",
                                  viewonly=True)

class FamilyRelationship(Base):
    __tablename__ = "family_relationships"

    id = Column(Integer, primary_key=True, index=True)
    # For parent-child relationships
    parent_id = Column(Integer, ForeignKey("people.id"), nullable=True)
    child_id = Column(Integer, ForeignKey("people.id"), nullable=True)
    
    # For spouse relationships  
    person1_id = Column(Integer, ForeignKey("people.id"), nullable=True)
    person2_id = Column(Integer, ForeignKey("people.id"), nullable=True)
    
    relationship_type = Column(String(20), nullable=False)  # 'parent' or 'spouse'
    parent_gender = Column(String(10), nullable=True)  # 'male' or 'female' for parent relationships
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    parent = relationship("Person", foreign_keys=[parent_id])
    child = relationship("Person", foreign_keys=[child_id])
    person1 = relationship("Person", foreign_keys=[person1_id])
    person2 = relationship("Person", foreign_keys=[person2_id])
    creator = relationship("UserModel", foreign_keys=[created_by])