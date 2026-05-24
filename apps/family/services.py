from datetime import datetime, timedelta
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Tuple, Dict, Any
from fastapi import HTTPException, status
import re

from apps.family.models import Person, FamilyRelationship
from apps.family.schemas import PersonCreate, PersonUpdate, PersonSearch

# Person Services
def create_person(
    db: Session, 
    person_data: PersonCreate, 
    user_id: int
) -> Tuple[Person, List[str], bool]:
    """
    Create a new person and automatically connect to family tree
    Returns: (person, relationships_created, family_connected)
    """
    try:
        # Check if person already exists
        existing_person = find_person_by_name(
            db, 
            person_data.first_name, 
            person_data.last_name
        )
        
        if existing_person:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Person with this name already exists"
            )
        
        db_person = Person(
            **person_data.model_dump(),
            created_by=user_id
        )
        
        db.add(db_person)
        db.flush()  # Get ID without committing
        
        # Auto-create relationships based on father/mother/spouse names
        relationships_created = []
        family_connected = False
        
        # Connect to father if provided
        if person_data.father_name:
            father = find_person_by_full_name(db, person_data.father_name)
            if father:
                create_parent_relationship(db, father.id, db_person.id, user_id, 'male')
                relationships_created.append(f"Father: {father.first_name} {father.last_name}")
                family_connected = True
        
        # Connect to mother if provided  
        if person_data.mother_name:
            mother = find_person_by_full_name(db, person_data.mother_name)
            if mother:
                create_parent_relationship(db, mother.id, db_person.id, user_id, 'female')
                relationships_created.append(f"Mother: {mother.first_name} {mother.last_name}")
                family_connected = True
        
        # Connect to spouse if provided
        if person_data.spouse_name:
            spouse = find_person_by_full_name(db, person_data.spouse_name)
            if spouse:
                create_spouse_relationship(db, db_person.id, spouse.id, user_id)
                relationships_created.append(f"Spouse: {spouse.first_name} {spouse.last_name}")
                # If spouse is connected to family, consider this person connected too
                if is_person_connected_to_family(db, spouse.id):
                    family_connected = True
        
        db.commit()
        db.refresh(db_person)
        
        return db_person, relationships_created, family_connected
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating person: {str(e)}"
        )

def get_person(db: Session, person_id: int) -> Optional[Person]:
    """
    Get a specific person by ID
    """
    return db.query(Person).filter(Person.id == person_id).first()

def find_person_by_name(db: Session, first_name: str, last_name: str) -> Optional[Person]:
    """
    Find person by first and last name
    """
    return db.query(Person).filter(
        and_(
            func.lower(Person.first_name) == func.lower(first_name),
            func.lower(Person.last_name) == func.lower(last_name)
        )
    ).first()

def find_person_by_full_name(db: Session, full_name: str) -> Optional[Person]:
    """
    Find person by full name (handles various name formats)
    """
    # Clean and split the name
    name_parts = re.split(r'\s+', full_name.strip())
    
    if len(name_parts) == 2:
        first_name, last_name = name_parts
        return find_person_by_name(db, first_name, last_name)
    elif len(name_parts) >= 3:
        first_name = name_parts[0]
        last_name = name_parts[-1]
        # Try with and without middle name
        person = find_person_by_name(db, first_name, last_name)
        if person:
            return person
        
        # Try first + middle as first name
        first_name = ' '.join(name_parts[:-1])
        return find_person_by_name(db, first_name, last_name)
    
    return None

def search_people(
    db: Session,
    search_query: str,
    skip: int = 0,
    limit: int = 50
) -> Tuple[List[Person], int]:
    """
    Search people by name
    """
    search_terms = f"%{search_query}%"
    
    query = db.query(Person).filter(
        or_(
            Person.first_name.ilike(search_terms),
            Person.last_name.ilike(search_terms),
            Person.middle_name.ilike(search_terms)
        )
    )
    
    total = query.count()
    people = query.offset(skip).limit(limit).all()
    
    return people, total

def update_person(
    db: Session, 
    person_id: int, 
    person_data: PersonUpdate
) -> Person:
    """
    Update an existing person
    """
    db_person = get_person(db, person_id)
    if not db_person:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found"
        )
    
    try:
        update_data = person_data.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_person, field, value)
        
        db.commit()
        db.refresh(db_person)
        return db_person
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating person: {str(e)}"
        )

def delete_person(db: Session, person_id: int) -> dict:
    """
    Delete a person and their relationships
    """
    db_person = get_person(db, person_id)
    if not db_person:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found"
        )
    
    try:
        # Delete relationships where this person is involved
        db.query(FamilyRelationship).filter(
            or_(
                FamilyRelationship.parent_id == person_id,
                FamilyRelationship.child_id == person_id,
                FamilyRelationship.person1_id == person_id,
                FamilyRelationship.person2_id == person_id
            )
        ).delete()
        
        # Delete the person
        db.delete(db_person)
        db.commit()
        
        return {"message": "Person deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting person: {str(e)}"
        )

# Relationship Services
def create_parent_relationship(
    db: Session, 
    parent_id: int, 
    child_id: int, 
    user_id: int,
    parent_gender: str
) -> FamilyRelationship:
    """
    Create a parent-child relationship
    """
    if parent_id == child_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A person cannot be their own parent"
        )
    
    # Check if relationship already exists
    existing_relationship = db.query(FamilyRelationship).filter(
        and_(
            FamilyRelationship.parent_id == parent_id,
            FamilyRelationship.child_id == child_id,
            FamilyRelationship.relationship_type == 'parent'
        )
    ).first()
    
    if existing_relationship:
        return existing_relationship
    
    db_relationship = FamilyRelationship(
        parent_id=parent_id,
        child_id=child_id,
        relationship_type='parent',
        parent_gender=parent_gender,
        created_by=user_id
    )
    
    db.add(db_relationship)
    db.commit()
    db.refresh(db_relationship)
    return db_relationship

def create_spouse_relationship(
    db: Session, 
    person1_id: int, 
    person2_id: int, 
    user_id: int
) -> FamilyRelationship:
    """
    Create a spouse relationship
    """
    if person1_id == person2_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A person cannot be their own spouse"
        )
    
    # Check if relationship already exists
    existing_relationship = db.query(FamilyRelationship).filter(
        or_(
            and_(
                FamilyRelationship.person1_id == person1_id,
                FamilyRelationship.person2_id == person2_id,
                FamilyRelationship.relationship_type == 'spouse'
            ),
            and_(
                FamilyRelationship.person1_id == person2_id,
                FamilyRelationship.person2_id == person1_id,
                FamilyRelationship.relationship_type == 'spouse'
            )
        )
    ).first()
    
    if existing_relationship:
        return existing_relationship
    
    db_relationship = FamilyRelationship(
        person1_id=person1_id,
        person2_id=person2_id,
        relationship_type='spouse',
        created_by=user_id
    )
    
    db.add(db_relationship)
    db.commit()
    db.refresh(db_relationship)
    return db_relationship

def is_person_connected_to_family(
    db: Session,
    person_id: int,
    visited: Optional[set[int]] = None
) -> bool:
    """
    Check if a person is connected to the family tree
    A person is connected if they have parents or children in the system
    """
    visited = visited or set()
    if person_id in visited:
        return False

    visited.add(person_id)

    # Check if person has parents
    has_parents = db.query(FamilyRelationship).filter(
        and_(
            FamilyRelationship.child_id == person_id,
            FamilyRelationship.relationship_type == 'parent'
        )
    ).first() is not None
    
    # Check if person has children
    has_children = db.query(FamilyRelationship).filter(
        and_(
            FamilyRelationship.parent_id == person_id,
            FamilyRelationship.relationship_type == 'parent'
        )
    ).first() is not None
    
    # Check if person has a spouse who is connected to family
    spouse_connected = False
    spouse_relations = db.query(FamilyRelationship).filter(
        and_(
            FamilyRelationship.relationship_type == 'spouse',
            or_(
                FamilyRelationship.person1_id == person_id,
                FamilyRelationship.person2_id == person_id
            )
        )
    ).all()
    
    for relation in spouse_relations:
        spouse_id = relation.person1_id if relation.person1_id != person_id else relation.person2_id
        if spouse_id and is_person_connected_to_family(db, spouse_id, visited.copy()):
            spouse_connected = True
            break
    
    return has_parents or has_children or spouse_connected


def count_family_generations(db: Session) -> int:
    """
    Estimate the deepest generation depth in the recorded parent-child graph.
    """
    parent_child_rows = db.query(
        FamilyRelationship.parent_id,
        FamilyRelationship.child_id
    ).filter(
        FamilyRelationship.relationship_type == 'parent',
        FamilyRelationship.parent_id.isnot(None),
        FamilyRelationship.child_id.isnot(None),
    ).all()

    if not parent_child_rows:
        return 0

    children_by_parent = defaultdict(set)
    all_nodes = set()
    child_nodes = set()

    for parent_id, child_id in parent_child_rows:
        children_by_parent[parent_id].add(child_id)
        all_nodes.update([parent_id, child_id])
        child_nodes.add(child_id)

    roots = all_nodes - child_nodes or all_nodes
    memo: Dict[int, int] = {}

    def get_depth(person_id: int, path: set[int]) -> int:
        if person_id in path:
            return 0

        if person_id in memo:
            return memo[person_id]

        children = children_by_parent.get(person_id, set())
        if not children:
            memo[person_id] = 1
            return 1

        depth = 1 + max(get_depth(child_id, path | {person_id}) for child_id in children)
        memo[person_id] = depth
        return depth

    return max(get_depth(root_id, set()) for root_id in roots)

def get_person_family_tree(
    db: Session, 
    person_id: int, 
    max_generations: int = 3
) -> Dict[str, Any]:
    """
    Get comprehensive family tree for a person
    """
    person = get_person(db, person_id)
    if not person:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found"
        )
    
    def build_tree_node(current_person_id: int, current_generation: int = 0) -> Dict[str, Any]:
        if current_generation >= max_generations:
            return None
        
        current_person = get_person(db, current_person_id)
        if not current_person:
            return None
        
        # Get father
        father_rel = db.query(FamilyRelationship).filter(
            and_(
                FamilyRelationship.child_id == current_person_id,
                FamilyRelationship.relationship_type == 'parent',
                FamilyRelationship.parent_gender == 'male'
            )
        ).first()
        
        father_node = None
        if father_rel:
            father_node = build_tree_node(father_rel.parent_id, current_generation + 1)
        
        # Get mother
        mother_rel = db.query(FamilyRelationship).filter(
            and_(
                FamilyRelationship.child_id == current_person_id,
                FamilyRelationship.relationship_type == 'parent',
                FamilyRelationship.parent_gender == 'female'
            )
        ).first()
        
        mother_node = None
        if mother_rel:
            mother_node = build_tree_node(mother_rel.parent_id, current_generation + 1)
        
        # Get spouses
        spouse_relations = db.query(FamilyRelationship).filter(
            and_(
                FamilyRelationship.relationship_type == 'spouse',
                or_(
                    FamilyRelationship.person1_id == current_person_id,
                    FamilyRelationship.person2_id == current_person_id
                )
            )
        ).all()
        
        spouse_nodes = []
        for spouse_rel in spouse_relations:
            spouse_id = spouse_rel.person1_id if spouse_rel.person1_id != current_person_id else spouse_rel.person2_id
            spouse_node = build_tree_node(spouse_id, current_generation)
            if spouse_node:
                spouse_nodes.append(spouse_node)
        
        # Get children
        children_relations = db.query(FamilyRelationship).filter(
            and_(
                FamilyRelationship.parent_id == current_person_id,
                FamilyRelationship.relationship_type == 'parent'
            )
        ).all()
        
        child_nodes = []
        for child_rel in children_relations:
            child_node = build_tree_node(child_rel.child_id, current_generation - 1)
            if child_node:
                child_nodes.append(child_node)
        
        return {
            "person": current_person,
            "father": father_node,
            "mother": mother_node,
            "spouses": spouse_nodes,
            "children": child_nodes
        }
    
    tree = build_tree_node(person_id)
    
    # Count total people in tree
    total_people = count_people_in_tree(tree) if tree else 1
    
    return {
        "root_person": person,
        "tree": tree,
        "total_people": total_people,
        "generations": max_generations
    }

def count_people_in_tree(tree_node: Dict[str, Any]) -> int:
    """
    Count total unique people in a family tree
    """
    if not tree_node:
        return 0
    
    count = 1  # Current person
    
    if tree_node.get("father"):
        count += count_people_in_tree(tree_node["father"])
    
    if tree_node.get("mother"):
        count += count_people_in_tree(tree_node["mother"])
    
    for spouse in tree_node.get("spouses", []):
        count += count_people_in_tree(spouse)
    
    for child in tree_node.get("children", []):
        count += count_people_in_tree(child)
    
    return count

def auto_add_person_to_family(
    db: Session,
    person_data: PersonCreate,
    user_id: int
) -> Dict[str, Any]:
    """
    Automatically add person to family tree by connecting via parents/spouse
    """
    # First, check for exact match
    existing_person = find_person_by_name(db, person_data.first_name, person_data.last_name)
    
    if existing_person:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Person already exists in family tree"
        )
    
    # Create the person with automatic relationships
    person, relationships_created, family_connected = create_person(db, person_data, user_id)
    
    if family_connected:
        message = f"Person successfully connected to family tree with {len(relationships_created)} relationship(s)"
    else:
        message = "Person added but not connected to family tree. No matching parents/spouse found."
    
    return {
        "person": person,
        "relationships_created": relationships_created,
        "message": message,
        "family_connected": family_connected
    }

# Statistics
def get_family_statistics(db: Session) -> Dict[str, Any]:
    """
    Get family statistics
    """
    total_people = db.query(Person).count()
    
    # Count people connected to family
    connected_count = 0
    all_people = db.query(Person).all()
    for person in all_people:
        if is_person_connected_to_family(db, person.id):
            connected_count += 1
    
    verified_count = db.query(Person).filter(Person.is_verified == True).count()
    with_user_accounts = db.query(Person).filter(Person.user_id.isnot(None)).count()
    generations = count_family_generations(db)
    pending_members = max(total_people - connected_count, 0)

    recent_cutoff = datetime.utcnow() - timedelta(days=30)
    recent_additions = db.query(Person).filter(
        Person.created_at.isnot(None),
        Person.created_at >= recent_cutoff
    ).count()
    
    return {
        "total_people": total_people,
        "generations": generations,
        "connected_to_family": connected_count,
        "pending_members": pending_members,
        "verified_count": verified_count,
        "with_user_accounts": with_user_accounts,
        "recent_additions": recent_additions,
    }
