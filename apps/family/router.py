from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from apps.family.schemas import (
    PersonCreate, PersonUpdate, PersonResponse, PersonListResponse,
    PersonSearch, PersonMatchResponse, AutoAddResponse, ComprehensiveFamilyTree,
    FamilyStatsResponse
)
from apps.family.services import (
    create_person, get_person, search_people, update_person, delete_person,
    get_person_family_tree, auto_add_person_to_family,
    get_family_statistics, find_person_by_full_name, is_person_connected_to_family
)
from apps.auth.services import get_db, get_current_user, get_current_admin
from apps.auth.models import UserModel
from apps.family.models import Person

router = APIRouter()


def serialize_person(person: Person) -> PersonResponse:
    response_data = PersonResponse.model_validate(person)
    response_data.creator_name = person.creator.name if person.creator else "Unknown"
    response_data.user_account_name = person.user_account.name if person.user_account else None
    return response_data

# Person Endpoints
@router.post(
    "/people",
    response_model=PersonResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a person to family tree",
    description="Add a new person to the family tree"
)
def add_person(
    person_data: PersonCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Add a new person to the family tree.
    
    - **first_name**: First name (required)
    - **last_name**: Last name (required)  
    - **father_name**: Father's full name for auto-linking (optional)
    - **mother_name**: Mother's full name for auto-linking (optional)
    - **spouse_name**: Spouse's full name for auto-linking (optional)
    """
    person, relationships_created, family_connected = create_person(db, person_data, current_user.id)

    response_data = serialize_person(person)
    response_data.creator_name = current_user.name
    response_data.is_connected_to_tree = family_connected or is_person_connected_to_family(db, person.id)

    return response_data

@router.post(
    "/people/auto-add",
    response_model=AutoAddResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Auto-add person to family tree",
    description="Automatically add person and connect to family via parents/spouse"
)
def auto_add_person(
    person_data: PersonCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Automatically add a person to the family tree.
    The system will connect them via father, mother, or spouse relationships.
    Returns whether the person was successfully connected to the family tree.
    """
    result = auto_add_person_to_family(db, person_data, current_user.id)
    
    response_data = serialize_person(result["person"])
    response_data.creator_name = current_user.name
    response_data.is_connected_to_tree = result["family_connected"] or is_person_connected_to_family(
        db,
        result["person"].id
    )
    
    return AutoAddResponse(
        person=response_data,
        relationships_created=result["relationships_created"],
        message=result["message"],
        family_connected=result["family_connected"]
    )

@router.post(
    "/people/search",
    response_model=PersonMatchResponse,
    summary="Search for people in family tree",
    description="Search for people by name"
)
def search_person(
    search_data: PersonSearch,
    db: Session = Depends(get_db)
):
    """
    Search for people in the family tree by name.
    """
    # Look for exact match
    exact_match = find_person_by_full_name(
        db, f"{search_data.first_name} {search_data.last_name}"
    )
    
    # Find similar matches
    similar_matches, total = search_people(
        db, f"{search_data.first_name} {search_data.last_name}", limit=10
    )
    
    # Remove exact match from similar matches if present
    if exact_match:
        similar_matches = [p for p in similar_matches if p.id != exact_match.id]
    
    message = "No matches found"
    if exact_match:
        message = "Exact match found"
    elif similar_matches:
        message = f"Found {len(similar_matches)} similar matches"

    exact_match_response = None
    if exact_match:
        exact_match_response = serialize_person(exact_match)
        exact_match_response.is_connected_to_tree = is_person_connected_to_family(db, exact_match.id)

    match_responses = []
    for person in similar_matches:
        response_data = serialize_person(person)
        response_data.is_connected_to_tree = is_person_connected_to_family(db, person.id)
        match_responses.append(response_data)
    
    return PersonMatchResponse(
        matches=match_responses,
        exact_match=exact_match_response,
        message=message
    )

@router.get(
    "/people",
    response_model=PersonListResponse,
    summary="Get all people in family tree",
    description="Retrieve all people with pagination and search"
)
def get_people(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Number of records to return"),
    search: Optional[str] = Query(None, description="Search by name"),
    db: Session = Depends(get_db),
):
    """
    Retrieve all people in the family tree.
    """
    if search:
        people, total = search_people(db, search, skip, limit)
    else:
        query = db.query(Person)
        total = query.count()
        people = query.offset(skip).limit(limit).all()
    
    people_responses = []
    for person in people:
        response_data = serialize_person(person)
        response_data.is_connected_to_tree = is_person_connected_to_family(db, person.id)
        people_responses.append(response_data)
    
    return PersonListResponse(
        items=people_responses,
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        size=limit
    )

@router.get(
    "/people/{person_id}",
    response_model=PersonResponse,
    summary="Get a specific person",
    description="Retrieve details of a specific person"
)
def get_person_details(
    person_id: int,
    db: Session = Depends(get_db),
):
    """
    Retrieve details of a specific person.
    """
    person = get_person(db, person_id)
    if not person:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found"
        )
    
    response_data = serialize_person(person)
    response_data.is_connected_to_tree = is_person_connected_to_family(db, person.id)
    
    return response_data

@router.get(
    "/people/{person_id}/family-tree",
    response_model=ComprehensiveFamilyTree,
    summary="Get person's family tree",
    description="Retrieve comprehensive family tree for a person"
)
def get_person_family_tree_endpoint(
    person_id: int,
    generations: int = Query(3, ge=1, le=5, description="Number of generations to include"),
    db: Session = Depends(get_db),
):
    """
    Retrieve comprehensive family tree for a specific person.
    Shows parents, children, spouses across multiple generations.
    """
    tree_data = get_person_family_tree(db, person_id, generations)
    
    if not tree_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found or no family tree data available"
        )
    
    # Convert to response format
    root_person_response = serialize_person(tree_data["root_person"])
    root_person_response.is_connected_to_tree = is_person_connected_to_family(
        db,
        tree_data["root_person"].id
    )
    
    return ComprehensiveFamilyTree(
        root_person=root_person_response,
        tree=tree_data["tree"],
        total_people=tree_data["total_people"],
        generations=tree_data["generations"]
    )

@router.put(
    "/people/{person_id}",
    response_model=PersonResponse,
    summary="Update a person",
    description="Update details of a specific person"
)
def update_person_details(
    person_id: int,
    person_data: PersonUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin)
):
    """
    Update details of a specific person.
    """
    person = update_person(db, person_id, person_data)
    
    response_data = serialize_person(person)
    response_data.is_connected_to_tree = is_person_connected_to_family(db, person.id)
    
    return response_data

@router.delete(
    "/people/{person_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a person",
    description="Delete a person from the family tree"
)
def delete_person_endpoint(
    person_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin)
):
    """
    Delete a person and all their relationships from the family tree.
    """
    return delete_person(db, person_id)

# Statistics Endpoint
@router.get(
    "/statistics",
    response_model=FamilyStatsResponse,
    summary="Get family statistics",
    description="Retrieve statistics about the family tree"
)
def get_family_stats(
    db: Session = Depends(get_db)
):
    """
    Retrieve comprehensive statistics about the family tree.
    """
    stats = get_family_statistics(db)
    return FamilyStatsResponse(**stats)
